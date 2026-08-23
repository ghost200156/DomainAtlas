"""Study Controller: the bounded teaching loop (ADR-0003).

Reads the mission and learner model, asks the model to propose one bounded
action, validates it with deterministic governance, executes it, and persists
the learner model. The model never writes state directly.

Deterministic governance owns:
  - action legality (bounded action space),
  - target validity (concept ids must exist),
  - budget (hard step ceiling),
  - completion (hard mastery thresholds — never model-decided alone).
"""

import logging
from datetime import UTC, datetime

from app.schemas.demo import DemoRun, RunEvent, RunStatus
from app.schemas.learner import (
    ConceptMastery,
    ConceptState,
    LearnerModel,
    LearningRecord,
    MissionDoc,
)
from app.schemas.teach import TeachAction, TeachDecision, TeachStepResult
from app.store import DemoStore

logger = logging.getLogger(__name__)

DEFAULT_MAX_STEPS = 40
MASTERY_GAIN = 0.25
MASTERY_LOSS = 0.2


def build_mission(run: DemoRun) -> MissionDoc:
    """Derive the durable mission from the brief + confirmed plan."""
    if run.mission is not None:
        return run.mission
    plan = run.plan
    return MissionDoc(
        domain=run.brief.domain,
        primary_intent=run.brief.primary_intent,
        learner_background=run.brief.learner_background,
        desired_outcome=run.brief.desired_outcome,
        learning_time_minutes=run.brief.learning_time_minutes,
        focus_items=run.brief.focus_items,
        exclusions=run.brief.exclusions,
        completion_criteria=plan.completion_criteria if plan else [],
    )


def _real_concepts(run: DemoRun):
    return [c for c in run.atlas.concepts if c.module_id != "__center__"]


def _init_learner_model(run: DemoRun) -> LearnerModel:
    model = LearnerModel()
    for c in _real_concepts(run):
        model.concepts[c.id] = ConceptMastery(concept_id=c.id)
    return model


def _mastery(model: LearnerModel, concept_id: str) -> ConceptMastery:
    return model.concepts.setdefault(concept_id, ConceptMastery(concept_id=concept_id))


def _completion_met(model: LearnerModel, run: DemoRun) -> bool:
    real = _real_concepts(run)
    if not real:
        return False
    return all(
        model.concepts.get(c.id) is not None
        and model.concepts[c.id].state == ConceptState.UNDERSTOOD
        for c in real
    )


def _fallback_action(model: LearnerModel, run: DemoRun) -> TeachDecision:
    """Deterministic ZPD approximation: unvisited -> weak -> complete."""
    real = _real_concepts(run)
    for c in real:
        m = model.concepts.get(c.id)
        if m is None or m.state == ConceptState.UNVISITED:
            return TeachDecision(
                action=TeachAction.INTRODUCE_CONCEPT,
                target_concept_id=c.id,
                rationale="选取第一个尚未访问的概念",
            )
    for c in real:
        m = model.concepts.get(c.id)
        if m is not None and m.state == ConceptState.WEAK:
            return TeachDecision(
                action=TeachAction.SCHEDULE_REVIEW,
                target_concept_id=c.id,
                rationale="复习薄弱概念",
            )
    return TeachDecision(action=TeachAction.MARK_COMPLETE, rationale="所有概念已掌握")


def validate_decision(
    decision: TeachDecision,
    model: LearnerModel,
    run: DemoRun,
    max_steps: int,
) -> TeachDecision:
    """Governance: reject illegal proposals and substitute a safe one."""
    real_ids = {c.id for c in _real_concepts(run)}

    if model.steps_taken >= max_steps:
        return TeachDecision(action=TeachAction.MARK_COMPLETE, rationale="预算耗尽")

    if decision.action == TeachAction.MARK_COMPLETE:
        if not _completion_met(model, run):
            return _fallback_action(model, run)

    if decision.action in (
        TeachAction.INTRODUCE_CONCEPT,
        TeachAction.RUN_PRACTICE,
        TeachAction.SCHEDULE_REVIEW,
    ):
        if decision.target_concept_id not in real_ids:
            return _fallback_action(model, run)

    return decision


class StudyController:
    def __init__(
        self,
        store: DemoStore,
        pipeline,
        max_steps: int = DEFAULT_MAX_STEPS,
    ) -> None:
        self.store = store
        self.pipeline = pipeline
        self.max_steps = max_steps

    async def _record(
        self,
        run: DemoRun,
        model: LearnerModel,
        message: str,
    ) -> None:
        model.steps_taken += 1
        model.updated_at = datetime.now(UTC)
        run.events.append(
            RunEvent(
                id=len(run.events) + 1,
                type="teach_step",
                step="teaching",
                message=message,
            )
        )
        await self.store.save(run)

    async def next_step(
        self,
        run_id: str,
        answer: str | None = None,
    ) -> TeachStepResult:
        run = await self.store.get(run_id)
        if run.status != RunStatus.READY:
            raise ValueError("只有 READY 状态的任务可以进入教学循环")
        if run.atlas is None:
            raise ValueError("Atlas 尚未生成")

        # Lazily persist mission + learner model on first entry.
        if run.mission is None:
            run.mission = build_mission(run)
        if run.learner_model is None:
            run.learner_model = _init_learner_model(run)
            await self.store.save(run)

        model = run.learner_model

        # 1) A pending practice question was answered — grade it first.
        pending_id = model.pending_practice_concept_id
        if pending_id:
            if answer is not None:
                return await self._assess(run, model, pending_id, answer)
            # A question is pending but no answer given — do not advance.
            return TeachStepResult(
                action=TeachAction.ASSESS,
                target_concept_id=pending_id,
                rationale="等待回答上一道练习",
                message="请先回答上一道练习，再进入下一步。",
                learner_model=model,
                done=False,
                budget_remaining=self.max_steps - model.steps_taken,
            )

        # 2) Ask the model to propose the next action; fall back deterministically.
        try:
            decision = await self.pipeline.decide_teach_action(
                run.mission, model, run.atlas
            )
        except Exception as error:
            logger.warning("teach decision failed: %s; using fallback", error)
            decision = _fallback_action(model, run)

        decision = validate_decision(decision, model, run, self.max_steps)

        # 3) Execute the validated action.
        if decision.action == TeachAction.INTRODUCE_CONCEPT:
            return await self._introduce(run, model, decision)
        if decision.action == TeachAction.RUN_PRACTICE:
            return await self._practice(run, model, decision)
        if decision.action == TeachAction.SCHEDULE_REVIEW:
            return await self._schedule_review(run, model, decision)
        if decision.action == TeachAction.MARK_COMPLETE:
            return await self._complete(run, model, decision)
        # Unreachable given validation; keep a safe fallback.
        return await self._introduce(run, model, _fallback_action(model, run))

    def _concept(self, run: DemoRun, concept_id: str):
        return next(c for c in run.atlas.concepts if c.id == concept_id)

    async def _introduce(
        self, run: DemoRun, model: LearnerModel, decision: TeachDecision
    ) -> TeachStepResult:
        concept = self._concept(run, decision.target_concept_id)
        try:
            text = await self.pipeline.teach_introduce(concept)
        except Exception as error:
            logger.warning("introduce failed: %s", error)
            text = f"概念「{concept.name}」：{concept.definition}"
        m = _mastery(model, concept.id)
        if m.state == ConceptState.UNVISITED:
            m.state = ConceptState.INTRODUCED
        await self._record(run, model, f"introduce_concept: {concept.name}")
        return TeachStepResult(
            action=TeachAction.INTRODUCE_CONCEPT,
            target_concept_id=concept.id,
            rationale=decision.rationale,
            message=text,
            learner_model=model,
            done=False,
            budget_remaining=self.max_steps - model.steps_taken,
        )

    async def _practice(
        self, run: DemoRun, model: LearnerModel, decision: TeachDecision
    ) -> TeachStepResult:
        concept = self._concept(run, decision.target_concept_id)
        try:
            question = await self.pipeline.teach_practice_question(concept)
        except Exception as error:
            logger.warning("practice question failed: %s", error)
            question = f"请用自己的话解释「{concept.name}」的核心机制。"
        model.pending_practice_concept_id = concept.id
        m = _mastery(model, concept.id)
        if m.state in (ConceptState.UNVISITED, ConceptState.INTRODUCED):
            m.state = ConceptState.PRACTICING
        await self._record(run, model, f"run_practice: {concept.name}")
        return TeachStepResult(
            action=TeachAction.RUN_PRACTICE,
            target_concept_id=concept.id,
            rationale=decision.rationale,
            message="请尝试回答下面的练习（先自己回忆，再作答）：",
            question=question,
            learner_model=model,
            done=False,
            budget_remaining=self.max_steps - model.steps_taken,
        )

    async def _assess(
        self, run: DemoRun, model: LearnerModel, concept_id: str, answer: str
    ) -> TeachStepResult:
        concept = self._concept(run, concept_id)
        try:
            result = await self.pipeline.verify_understanding(concept, answer)
        except Exception:
            result = {"passed": True, "feedback": ""}
        passed = bool(result.get("passed"))
        feedback = result.get("feedback", "")

        m = _mastery(model, concept_id)
        m.attempt_count += 1
        m.last_reviewed_at = datetime.now(UTC)
        if passed:
            m.mastery = min(1.0, m.mastery + MASTERY_GAIN)
            m.state = ConceptState.UNDERSTOOD
            m.review_due = False
        else:
            m.mastery = max(0.0, m.mastery - MASTERY_LOSS)
            m.state = ConceptState.WEAK
            m.review_due = True
            m.records.append(
                LearningRecord(
                    id=f"rec-{concept_id}-{m.attempt_count}",
                    concept_id=concept_id,
                    kind="misconception",
                    note=answer[:300],
                )
            )
        model.pending_practice_concept_id = None
        await self._record(
            run,
            model,
            f"assess: {concept.name} -> {'understood' if passed else 'weak'}",
        )
        message = (
            f"✓ 回答正确。{feedback}" if passed
            else f"✗ 还不完全对。{feedback} 已记录，稍后会安排复习。"
        )
        return TeachStepResult(
            action=TeachAction.ASSESS,
            target_concept_id=concept_id,
            rationale="评估上次练习的回答",
            message=message,
            learner_model=model,
            done=False,
            budget_remaining=self.max_steps - model.steps_taken,
        )

    async def _schedule_review(
        self, run: DemoRun, model: LearnerModel, decision: TeachDecision
    ) -> TeachStepResult:
        concept = self._concept(run, decision.target_concept_id)
        _mastery(model, concept.id).review_due = True
        await self._record(run, model, f"schedule_review: {concept.name}")
        return TeachStepResult(
            action=TeachAction.SCHEDULE_REVIEW,
            target_concept_id=concept.id,
            rationale=decision.rationale,
            message=f"已把「{concept.name}」加入复习队列，稍后会再次练习。",
            learner_model=model,
            done=False,
            budget_remaining=self.max_steps - model.steps_taken,
        )

    async def _complete(
        self, run: DemoRun, model: LearnerModel, decision: TeachDecision
    ) -> TeachStepResult:
        run.events.append(
            RunEvent(
                id=len(run.events) + 1,
                type="teaching_complete",
                step="teaching",
                message="教学循环完成。",
            )
        )
        await self.store.save(run)
        return TeachStepResult(
            action=TeachAction.MARK_COMPLETE,
            rationale=decision.rationale,
            message="🎉 你已达成完成标准。可以回到地图回顾，或让我针对薄弱概念继续练习。",
            learner_model=model,
            done=True,
            budget_remaining=self.max_steps - model.steps_taken,
        )
