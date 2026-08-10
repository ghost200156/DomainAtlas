import asyncio
import logging

from app.ai import GenerationFailure, GenerationSuccess
from app.ai.generate import generate_planning
from app.core.config import Settings, get_settings
from app.schemas.demo import DemoError, RunEvent, RunStatus
from app.store import DemoStore
from app.workflow.agents import LiveAgentPipeline
from app.workflow.fixtures import (
    make_atlas,
    make_calibration,
    make_plan,
    make_quality_report,
    make_research_pack,
)
from app.workflow.research import build_research_candidates
from app.workflow.validator import (
    repair_atlas_references,
    validate_atlas,
    validate_plan,
    validate_research_pack,
)

logger = logging.getLogger(__name__)


class DemoOrchestrator:
    def __init__(
        self,
        store: DemoStore,
        delay_seconds: float = 0.25,
        agent_mode: str | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.store = store
        self.delay_seconds = delay_seconds
        self.settings = settings or get_settings()
        self.agent_mode = agent_mode or self.settings.demo_agent_mode
        self._live_pipeline: LiveAgentPipeline | None = None

    def _can_run_live(self) -> bool:
        return (
            self.agent_mode != "fixture"
            and bool(self.settings.openai_api_base)
            and self.settings.openai_api_key != "demo-not-configured"
        )

    def _pipeline(self) -> LiveAgentPipeline:
        if self._live_pipeline is None:
            self._live_pipeline = LiveAgentPipeline(self.settings)
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
                result = await generate_planning(run.brief, self.settings)
                if isinstance(result, GenerationSuccess):
                    run.calibration = result.output.calibration
                    run.plan = result.output.plan
                    run.execution_mode = "live"
                else:
                    assert isinstance(result, GenerationFailure)
                    logger.warning(
                        "Planning generation failed after strategies %s: %s",
                        [attempt.strategy.value for attempt in result.diagnostics.attempts],
                        result.error.category,
                    )
                    self._use_fixture(run, step, result.error)
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

    async def generate_atlas(self, run_id: str) -> None:
        step = "researching"
        try:
            await self._checkpoint(run_id, step, "Research Agent 正在整理证据卡片。")
            run = await self.store.get(run_id)
            if run.plan is None:
                raise RuntimeError("缺少已确认的框架计划")
            fixture_pack = make_research_pack(run.plan)
            candidate_pack = (
                await build_research_candidates(
                    run.brief.domain,
                    run.plan,
                    fixture_pack,
                )
                if self._can_run_live()
                else fixture_pack
            )
            if self._can_run_live():
                try:
                    research_pack = await self._pipeline().research(
                        run.plan,
                        candidate_pack,
                    )
                    issues = validate_research_pack(
                        research_pack,
                        run.plan,
                        candidate_pack,
                    )
                    if issues:
                        raise RuntimeError("；".join(issues))
                    run.research_pack = research_pack
                except Exception as error:
                    self._use_fixture(run, step, error)
                    run.research_pack = candidate_pack
            else:
                run.research_pack = candidate_pack
            issues = validate_research_pack(run.research_pack, run.plan)
            if issues:
                raise RuntimeError("；".join(issues))
            await self.store.save(run)

            step = "building_structure"
            await self._checkpoint(run_id, step, "Atlas Agent 正在建立概念与关系。")
            run = await self.store.get(run_id)
            if run.plan is None or run.research_pack is None:
                raise RuntimeError("生成 Atlas 所需的中间产物不完整")
            if self._can_run_live():
                try:
                    atlas_issues: list[str] = []
                    for attempt in range(2):
                        candidate = await self._pipeline().build_atlas(
                            run.brief,
                            run.plan,
                            run.research_pack,
                        )
                        atlas_issues = validate_atlas(candidate, run.research_pack)
                        if not atlas_issues:
                            run.atlas = candidate
                            break
                        logger.warning(
                            "Atlas output validation failed on attempt %s: %s",
                            attempt + 1,
                            "；".join(atlas_issues),
                        )
                    else:
                        raise RuntimeError("；".join(atlas_issues))
                except Exception as error:
                    self._use_fixture(run, step, error)
                    run.atlas = make_atlas(run.brief, run.plan, run.research_pack)
            else:
                run.atlas = make_atlas(run.brief, run.plan, run.research_pack)
            await self.store.save(run)

            await self.finish_atlas(run_id)
        except Exception as error:
            await self._fail(run_id, step, error)

    async def finish_atlas(self, run_id: str) -> None:
        step = "validating"
        try:
            await self._checkpoint(run_id, step, "确定性校验器正在检查引用和结构。")
            run = await self.store.get(run_id)
            if run.atlas is None:
                raise RuntimeError("Atlas 尚未生成")
            repairs = repair_atlas_references(run.atlas, run.research_pack)
            if repairs:
                run.events.append(
                    RunEvent(
                        id=len(run.events) + 1,
                        type="reference_repair",
                        step=step,
                        message=f"确定性校验器修复了 {len(repairs)} 处模型引用。",
                    )
                )
            issues = validate_atlas(run.atlas, run.research_pack)
            if issues:
                raise RuntimeError("；".join(issues))

            step = "reviewing"
            await self._checkpoint(run_id, step, "质量审阅正在检查覆盖度与学习路径。")
            run = await self.store.get(run_id)
            run.quality_report = make_quality_report()
            await self.store.save(run)

            step = "publishing"
            await self._checkpoint(run_id, step, "正在发布可交互的领域地图。")
            run = await self.store.get(run_id)
            run.status = RunStatus.READY
            run.current_step = "ready"
            run.events.append(
                RunEvent(
                    id=len(run.events) + 1,
                    type="atlas_ready",
                    step="ready",
                    message="领域地图已经可以探索。",
                )
            )
            await self.store.save(run)
        except Exception as error:
            await self._fail(run_id, step, error)
