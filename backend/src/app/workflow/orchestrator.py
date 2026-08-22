import asyncio
import logging

from app.core.config import Settings, get_settings
from app.schemas.demo import (
    AtlasDocument,
    AtlasModule,
    AtlasOverview,
    ConceptNode,
    ConceptRelation,
    DemoError,
    RunEvent,
    RunStatus,
)
from app.store import DemoStore
from app.workflow.agents_per_module import LiveAgentPipeline
from app.workflow.fixtures import (
    make_calibration,
    make_plan,
    make_research_pack,
)
from app.workflow.research import build_research_candidates
from app.workflow.validator import validate_plan

logger = logging.getLogger(__name__)


class DemoOrchestrator:
    def __init__(
        self,
        store: DemoStore,
        delay_seconds: float = 0.25,
        agent_mode: str | None = None,
        settings: Settings | None = None,
        skill_registry: object | None = None,
    ) -> None:
        self.store = store
        self.delay_seconds = delay_seconds
        self.settings = settings or get_settings()
        self.agent_mode = agent_mode or self.settings.demo_agent_mode
        self._skill_registry = skill_registry
        self._live_pipeline: LiveAgentPipeline | None = None

    def _can_run_live(self) -> bool:
        return (
            self.agent_mode != "fixture"
            and bool(self.settings.openai_api_base)
            and self.settings.openai_api_key != "demo-not-configured"
        )

    def pipeline(self) -> LiveAgentPipeline:
        if self._live_pipeline is None:
            self._live_pipeline = LiveAgentPipeline(
                self.settings,
                skill_registry=self._skill_registry,
            )
        return self._live_pipeline

    def _use_fixture(self, run, stage: str, error: Exception | None = None) -> None:
        if error is None:
            run.execution_mode = "fixture"
            note = "当前未启用真实模型，使用稳定演示资料。"
        else:
            if self.agent_mode == "live":
                raise error
            logger.warning(
                "%s agent fallback after %s: %s",
                stage,
                type(error).__name__,
                error,
            )
            run.execution_mode = "hybrid"
            note = f"{stage} 调用暂时不可用，已使用演示资料继续。"
        if note not in run.fallback_notes:
            run.fallback_notes.append(note)
        run.events.append(
            RunEvent(
                id=len(run.events) + 1,
                type="fallback",
                step=stage,
                message=note,
            )
        )

    async def _checkpoint(self, run_id: str, step: str, message: str) -> None:
        run = await self.store.get(run_id)
        run.current_step = step
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="progress", step=step, message=message)
        )
        await self.store.save(run)
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)

    async def _fail(self, run_id: str, step: str, error: Exception) -> None:
        run = await self.store.get(run_id)
        run.status = RunStatus.FAILED
        run.current_step = step
        run.error = DemoError(
            code="DEMO_PIPELINE_FAILED",
            message=f"{type(error).__name__}: 当前阶段未能完成",
            failed_step=step,
        )
        run.events.append(
            RunEvent(
                id=len(run.events) + 1,
                type="error",
                step=step,
                message="生成过程中出现问题，可以从当前任务重试。",
            )
        )
        await self.store.save(run)

    async def prepare_plan(self, run_id: str) -> None:
        step = "calibrating"
        try:
            await self._checkpoint(run_id, step, "Planning Agent 正在校准学习目标与范围。")
            run = await self.store.get(run_id)
            run.model_name = self.settings.openai_model if self._can_run_live() else None
            await self.store.save(run)

            step = "planning"
            await self._checkpoint(run_id, step, "Planning Agent 正在绘制模块路线。")
            run = await self.store.get(run_id)
            if self._can_run_live():
                try:
                    output = await self.pipeline().plan(run.brief)
                    run.calibration = output.calibration
                    run.plan = output.plan
                    run.execution_mode = "live"
                except Exception as error:
                    self._use_fixture(run, step, error)
                    run.calibration = make_calibration(run.brief)
                    run.plan = make_plan(run.brief)
            else:
                self._use_fixture(run, step)
                run.calibration = make_calibration(run.brief)
                run.plan = make_plan(run.brief)

            if run.plan is None:
                raise RuntimeError("Planning Agent 未返回框架")
            issues = validate_plan(run.plan)
            if issues:
                raise RuntimeError("；".join(issues))

            run.status = RunStatus.WAITING_CONFIRMATION
            run.current_step = "waiting_confirmation"
            run.events.append(
                RunEvent(
                    id=len(run.events) + 1,
                    type="plan_ready",
                    step="waiting_confirmation",
                    message="框架草图已完成，等待你的确认。",
                )
            )
            await self.store.save(run)
        except Exception as error:
            await self._fail(run_id, step, error)

    def init_empty_atlas(self, run) -> AtlasDocument:
        """Build an empty atlas: modules from the plan + a center overview node."""
        colors = ["#2f7f73", "#4e7896", "#d49a45", "#e46f46", "#776a9b", "#6d8b55"]
        atlas_mods = [
            AtlasModule(id=m.id, title=m.title, summary=m.purpose, color=colors[i % 6])
            for i, m in enumerate(run.plan.modules)
        ]
        overview = AtlasOverview(
            definition=run.plan.domain_definition,
            boundary=run.plan.scope,
            essential_question="如何在" + str(run.brief.learning_time_minutes) + "分钟内理解" + run.brief.domain + "？",
            key_takeaways=[m.title for m in run.plan.modules[:4]],
        )
        center = ConceptNode(
            id="__center__",
            module_id="__center__",
            name=run.brief.domain,
            definition=run.plan.domain_definition[:500],
            why_it_matters=run.brief.desired_outcome,
            key_points=(run.plan.completion_criteria if run.plan.completion_criteria else [])[:5],
            example=None,
            evidence_ids=[],
        )
        return AtlasDocument(
            title=run.brief.domain + " · 学习地图",
            overview=overview,
            modules=atlas_mods,
            concepts=[center],
            relations=[],
            mechanisms=[],
            cases=[],
            learning_path=[],
            assessments=[],
            sources=[],
            gaps=[],
        )

    def _next_chapter(self, run):
        """Return the next chapter (module) without a lesson node, or None."""
        grown = {c.module_id for c in run.atlas.concepts if c.module_id != "__center__"}
        for module in run.plan.modules:
            if module.id not in grown:
                return module
        return None

    async def save_node(self, run_id: str, question: str, answer: str) -> DemoRun:
        """Turn a teaching-session Q&A into a reusable node and add it to the map."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)
        node_id = "custom-" + str(len(run.atlas.concepts))
        if self._can_run_live():
            try:
                concept = await self.pipeline().grow_custom_node(run.brief, question, answer, node_id)
            except Exception as error:
                logger.warning("grow_custom_node failed: %s", error)
                concept = ConceptNode(
                    id=node_id, module_id="__center__", section_type="custom",
                    name=question[:40], definition=answer[:2000], why_it_matters="", key_points=[], quiz=[],
                )
        else:
            concept = ConceptNode(
                id=node_id, module_id="__center__", section_type="custom",
                name=question[:40], definition=answer[:2000], why_it_matters="", key_points=[], quiz=[],
            )
        run.atlas.concepts.append(concept)
        run.atlas.relations.append(
            ConceptRelation(
                id="r" + str(len(run.atlas.relations)),
                source_id="__center__",
                target_id=concept.id,
                relation_type="informs",
                explanation="",
            )
        )
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="node_grown", step="growing", message=f"从问答生成节点：{concept.name}")
        )
        await self.store.save(run)
        return run

    async def expand_node(self, run_id: str, concept_id: str, question: str) -> dict:
        """Deepen a concept: explain the learner's confusion point, quiz it, and
        auto-save the resulting sub-node (linked from the parent concept)."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)
        parent = next((c for c in run.atlas.concepts if c.id == concept_id), None)
        node_id = "expand-" + str(len(run.atlas.concepts))
        concept = None
        if self._can_run_live():
            try:
                concept = await self.pipeline().grow_custom_node(run.brief, question, "", node_id)
            except Exception as error:
                logger.warning("expand_node grow_custom_node failed: %s", error)
        if concept is None:
            concept = ConceptNode(
                id=node_id, module_id="__center__", section_type="custom",
                name=question[:40], definition=question[:500], why_it_matters="", key_points=[], quiz=[],
            )
        concept.module_id = parent.module_id if parent else "__center__"
        run.atlas.concepts.append(concept)
        run.progress[concept.id] = "understood"
        run.atlas.relations.append(
            ConceptRelation(
                id="r" + str(len(run.atlas.relations)),
                source_id=parent.id if parent else "__center__",
                target_id=concept.id,
                relation_type="informs",
                explanation="",
            )
        )
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="node_grown", step="growing", message=f"拓展生成节点：{concept.name}")
        )
        await self.store.save(run)
        return {
            "reply": concept.definition,
            "quiz": concept.quiz or [],
            "node_name": concept.name,
            "node_id": concept.id,
            "run": run,
        }

    async def chat(self, run_id: str, question: str, history: list) -> dict:
        """Answer a question; the agent may summarize the prior segment into a node."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)
        if self._can_run_live():
            try:
                result = await self.pipeline().chat(run.brief, run.atlas, question, history)
            except Exception as error:
                logger.warning("chat failed: %s", error)
                result = None
        else:
            result = None
        if result is None:
            return {"reply": "（模型暂时不可用，请稍后重试。）", "node_name": None, "node_definition": ""}
        node_name = result.node_name if result.summarize else None
        node_definition = result.node_definition if result.summarize else ""
        return {"reply": result.reply, "node_name": node_name, "node_definition": node_definition}

    async def persist_node(self, run_id: str, name: str, definition: str) -> DemoRun:
        """Persist a user-approved node (from a chat/review summary)."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)
        node_id = "custom-" + str(len(run.atlas.concepts))
        concept = ConceptNode(
            id=node_id, module_id="__center__", section_type="custom",
            name=name[:100], definition=definition[:4000], why_it_matters="", key_points=[], quiz=[],
        )
        run.atlas.concepts.append(concept)
        run.progress[concept.id] = "understood"
        run.atlas.relations.append(
            ConceptRelation(
                id="r" + str(len(run.atlas.relations)),
                source_id="__center__",
                target_id=concept.id,
                relation_type="informs",
                explanation="",
            )
        )
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="node_grown", step="growing", message=f"整理成节点：{concept.name}")
        )
        await self.store.save(run)
        return run

    async def review_questions(self, run_id: str, concept_id: str) -> dict:
        """Generate practice questions for a weak concept (no node yet)."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            raise ValueError("Atlas 尚未生成")
        concept = next((c for c in run.atlas.concepts if c.id == concept_id), None)
        if concept is None:
            raise ValueError("没有找到这个概念")
        knowledge, questions = "", []
        if self._can_run_live():
            try:
                result = await self.pipeline().review_questions(run.brief, concept)
                knowledge = result.get("knowledge", "")
                questions = result.get("questions", [])
            except Exception as error:
                logger.warning("review_questions failed: %s", error)
        return {"concept_name": concept.name, "knowledge": knowledge, "questions": questions}

    async def save_review(self, run_id: str, concept_id: str, concept_name: str, questions: list) -> DemoRun:
        """Persist an answered review as a node (deduped per concept)."""
        run = await self.store.get(run_id)
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)
        review_id = concept_id + "-review"
        if any(c.id == review_id for c in run.atlas.concepts):
            return run
        module_id = next((c.module_id for c in run.atlas.concepts if c.id == concept_id), "__center__")
        node = ConceptNode(
            id=review_id, module_id=module_id, section_type="review",
            name="复习：" + concept_name[:60],
            definition="## 复习\n针对你之前答错的点，再来几道：",
            quiz=questions or [],
        )
        run.atlas.concepts.append(node)
        run.progress[node.id] = "understood"
        run.atlas.relations.append(
            ConceptRelation(
                id="r" + str(len(run.atlas.relations)),
                source_id=concept_id,
                target_id=node.id,
                relation_type="evaluates",
                explanation="",
            )
        )
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="node_grown", step="growing", message=f"复习总结成节点：{node.name}")
        )
        await self.store.save(run)
        return run

    async def _grow_lesson_node(self, run, module) -> ConceptNode:
        evidence = [e for e in run.research_pack.evidence if e.module_id == module.id]
        if self._can_run_live():
            try:
                return await self.pipeline().grow_lesson(run.brief, module, evidence, run.plan)
            except Exception as error:
                logger.warning("grow_lesson failed: %s; using fallback", error)
                return self._fallback_lesson(module, error)
        return self._fallback_lesson(module)

    def _fallback_lesson(self, module, error: Exception | None = None) -> ConceptNode:
        err = f"：{error}" if error else ""
        return ConceptNode(
            id=module.id, module_id=module.id, section_type="concept",
            name=module.title,
            definition=f"## 概念\n{module.purpose}\n\n## 机制\n（模型暂时不可用{err}）",
            why_it_matters="", key_points=[], quiz=[],
        )

    async def grow_node(self, run_id: str) -> DemoRun:
        """Generate one complete lesson node for the next chapter (teach-style)."""
        run = await self.store.get(run_id)
        if run.plan is None:
            raise ValueError("缺少已确认的框架计划")
        if run.atlas is None:
            run.atlas = self.init_empty_atlas(run)
            await self.store.save(run)

        if run.research_pack is None:
            fixture_pack = make_research_pack(run.plan)
            run.research_pack = (
                await build_research_candidates(run.brief.domain, run.plan, fixture_pack)
                if self._can_run_live()
                else fixture_pack
            )
            await self.store.save(run)

        module = self._next_chapter(run)
        if module is None:
            run.growth_complete = True
            run.events.append(
                RunEvent(id=len(run.events) + 1, type="growth_complete", step="growing", message="已学完，地图生长结束。")
            )
            await self.store.save(run)
            return run

        concept = await self._grow_lesson_node(run, module)
        run.atlas.concepts.append(concept)
        run.atlas.relations.append(
            ConceptRelation(
                id="r" + str(len(run.atlas.relations)),
                source_id="__center__",
                target_id=concept.id,
                relation_type="informs",
                explanation="",
            )
        )
        run.events.append(
            RunEvent(id=len(run.events) + 1, type="node_grown", step="growing", message=f"生成章节：{concept.name}")
        )
        await self.store.save(run)
        return run
