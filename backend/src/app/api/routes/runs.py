import asyncio
import json
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.schemas.demo import (
    AssessmentAttemptRequest,
    AssessmentFeedback,
    AtlasDocument,
    ConfirmPlanRequest,
    DemoRun,
    FrameworkPlan,
    LearningBrief,
    ProgressUpdateRequest,
    RunEvent,
    RunStatus,
)
from app.store import DemoStore
from app.workflow.fixtures import make_atlas, make_plan, make_research_pack
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry
from app.workflow.validator import validate_plan

router = APIRouter(prefix="/api", tags=["demo"])
store = DemoStore()
orchestrator = DemoOrchestrator(store)
tasks = TaskRegistry()


async def _get_run(run_id: str) -> DemoRun:
    try:
        return await store.get(run_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="没有找到这个测绘任务") from error


@router.post("/runs", response_model=DemoRun, status_code=status.HTTP_202_ACCEPTED)
async def create_run(brief: LearningBrief) -> DemoRun:
    run = DemoRun(
        id=str(uuid4()),
        status=RunStatus.PREPARING_PLAN,
        current_step="queued",
        brief=brief,
        events=[RunEvent(id=1, type="created", step="queued", message="测绘任务已创建。")],
    )
    await store.save(run)
    tasks.start(f"prepare:{run.id}", orchestrator.prepare_plan(run.id))
    return run


@router.get("/runs/{run_id}", response_model=DemoRun)
async def get_run(run_id: str) -> DemoRun:
    return await _get_run(run_id)


@router.post("/runs/{run_id}/clarifications", response_model=DemoRun)
async def update_brief(run_id: str, brief: LearningBrief) -> DemoRun:
    run = await _get_run(run_id)
    run.brief = brief
    run.status = RunStatus.PREPARING_PLAN
    run.current_step = "queued"
    run.calibration = None
    run.plan = None
    run.research_pack = None
    run.atlas = None
    run.quality_report = None
    run.execution_mode = "live"
    run.model_name = None
    run.fallback_notes = []
    run.error = None
    await store.save(run)
    tasks.start(f"prepare:{run.id}", orchestrator.prepare_plan(run.id))
    return run


@router.patch("/runs/{run_id}/plan", response_model=DemoRun)
async def update_plan(run_id: str, plan: FrameworkPlan) -> DemoRun:
    run = await _get_run(run_id)
    issues = validate_plan(plan)
    if issues:
        raise HTTPException(status_code=422, detail=issues)
    run.plan = plan
    await store.save(run)
    return run


@router.post("/runs/{run_id}/plan/confirm", response_model=DemoRun, status_code=202)
async def confirm_plan(run_id: str, request: ConfirmPlanRequest) -> DemoRun:
    run = await _get_run(run_id)
    plan = request.plan or run.plan
    if plan is None:
        raise HTTPException(status_code=409, detail="框架计划还没有生成")
    issues = validate_plan(plan)
    if issues:
        raise HTTPException(status_code=422, detail=issues)

    run.plan = plan
    run.status = RunStatus.GENERATING
    run.current_step = "queued_for_research"
    run.error = None
    run.events.append(
        RunEvent(
            id=len(run.events) + 1,
            type="plan_confirmed",
            step="queued_for_research",
            message="框架已确认，开始研究和建图。",
        )
    )
    await store.save(run)
    tasks.start(f"generate:{run.id}", orchestrator.generate_atlas(run.id))
    return run


@router.post("/runs/{run_id}/retry", response_model=DemoRun, status_code=202)
async def retry_run(run_id: str) -> DemoRun:
    run = await _get_run(run_id)
    if run.status != RunStatus.FAILED:
        raise HTTPException(status_code=409, detail="只有失败的任务可以重试")

    failed_step = run.error.failed_step if run.error else None
    run.error = None
    if run.plan is None:
        run.status = RunStatus.PREPARING_PLAN
        await store.save(run)
        tasks.start(f"prepare:{run.id}", orchestrator.prepare_plan(run.id))
    elif (
        failed_step == "validating"
        and run.atlas is not None
        and run.research_pack is not None
    ):
        run.status = RunStatus.GENERATING
        await store.save(run)
        tasks.start(f"finish:{run.id}", orchestrator.finish_atlas(run.id))
    else:
        run.status = RunStatus.GENERATING
        await store.save(run)
        tasks.start(f"generate:{run.id}", orchestrator.generate_atlas(run.id))
    return run


@router.get("/runs/{run_id}/atlas", response_model=AtlasDocument)
async def get_atlas(run_id: str) -> AtlasDocument:
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    return run.atlas


@router.patch("/runs/{run_id}/progress/{concept_id}", response_model=DemoRun)
async def update_progress(
    run_id: str,
    concept_id: str,
    request: ProgressUpdateRequest,
) -> DemoRun:
    run = await _get_run(run_id)
    if run.atlas is None or concept_id not in {item.id for item in run.atlas.concepts}:
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    run.progress[concept_id] = request.state
    await store.save(run)
    return run


@router.post(
    "/runs/{run_id}/assessments/{assessment_id}",
    response_model=AssessmentFeedback,
)
async def attempt_assessment(
    run_id: str,
    assessment_id: str,
    request: AssessmentAttemptRequest,
) -> AssessmentFeedback:
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    assessment = next(
        (item for item in run.atlas.assessments if item.id == assessment_id),
        None,
    )
    if assessment is None:
        raise HTTPException(status_code=404, detail="没有找到这个自测题")

    is_correct = request.answer.strip() == assessment.expected_answer.strip()
    feedback = AssessmentFeedback(
        assessment_id=assessment_id,
        score=1 if is_correct else 0,
        feedback="判断正确，你已经抓住了这个环节的作用。" if is_correct else "再沿着相关概念回看一次，然后重试。",
        review_concept_ids=[] if is_correct else assessment.related_concept_ids,
    )
    run.assessment_results = [
        item for item in run.assessment_results if item.assessment_id != assessment_id
    ]
    run.assessment_results.append(feedback)
    await store.save(run)
    return feedback


@router.get("/runs/{run_id}/events")
async def stream_events(
    run_id: str,
    last_event_id: int = Header(default=0, alias="Last-Event-ID"),
) -> StreamingResponse:
    await _get_run(run_id)

    async def event_stream() -> AsyncIterator[str]:
        cursor = last_event_id
        while True:
            run = await _get_run(run_id)
            pending = [event for event in run.events if event.id > cursor]
            for event in pending:
                cursor = event.id
                data = json.dumps(event.model_dump(mode="json"), ensure_ascii=False)
                yield f"id: {event.id}\nevent: {event.type}\ndata: {data}\n\n"
            if run.status in {RunStatus.WAITING_CONFIRMATION, RunStatus.READY, RunStatus.FAILED}:
                return
            await asyncio.sleep(0.35)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/demo/fixture", response_model=AtlasDocument)
async def get_demo_fixture(response: Response) -> AtlasDocument:
    response.headers["Cache-Control"] = "no-store"
    brief = LearningBrief(
        domain="Agent 系统设计",
        primary_intent="task_driven",
        learner_background="了解大模型基础，希望快速做出一个可演示的项目。",
        desired_outcome="理解最小 Agent 系统的结构，并能解释其工作闭环。",
        learning_time_minutes=50,
    )
    plan = make_plan(brief)
    return make_atlas(brief, plan, make_research_pack(plan))
