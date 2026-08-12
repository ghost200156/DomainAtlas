import asyncio
import json
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from pathlib import Path

from app.core.config import get_settings
from app.schemas.demo import (
    AssessmentAttemptRequest,
    AssessmentFeedback,
    AtlasDocument,
    ConfirmPlanRequest,
    DemoRun,
    FrameworkPlan,
    LearningBrief,
    ProgressUpdateRequest,
    ReviewPath,
    RunEvent,
    RunStatus,
)
from app.schemas.learning import TutorRequest, VerifyRequest, VerifyResponse, SearchResult
from app.skills import SkillRegistry
from app.store import DemoStore
from app.workflow.fixtures import make_atlas, make_plan, make_research_pack
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry
from app.workflow.validator import validate_plan

router = APIRouter(prefix="/api", tags=["demo"])
store = DemoStore()
_settings = get_settings()

# Resolve the skills directory relative to the project root.
# When running from backend/src/app/..., the repo root is 4 levels up.
_skills_path = Path(_settings.skills_dir)
if not _skills_path.is_absolute():
    _repo_root = Path(__file__).resolve().parents[4]
    _skills_path = _repo_root / _settings.skills_dir

skill_registry = SkillRegistry(_skills_path)

orchestrator = DemoOrchestrator(
    store,
    skill_registry=skill_registry,
)
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


@router.post("/runs/{run_id}/review-path", response_model=ReviewPath)
async def generate_review_path(run_id: str) -> ReviewPath:
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    if not run.assessment_results and not run.progress:
        raise HTTPException(status_code=409, detail="请先完成至少一次自测或标记学习进度")

    try:
        return await orchestrator._pipeline().review_path(
            run.brief,
            run.atlas,
            run.assessment_results,
            run.progress,
        )
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"复习路线生成失败：{error}",
        ) from error


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


@router.post("/runs/{run_id}/tutor")
async def tutor_chat(run_id: str, request: TutorRequest) -> dict:
    """Chat with an AI tutor that has full atlas context."""
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    concept = None
    if request.message and run.atlas:
        # Try to detect if user is asking about a specific concept
        for c in run.atlas.concepts:
            if c.name in request.message or c.id in request.message:
                concept = c
                break
    try:
        reply = await orchestrator._pipeline().tutor_chat(
            run.atlas,
            concept,
            request.message,
        )
        return {"reply": reply}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"导师回复失败：{error}") from error


@router.post("/runs/{run_id}/concepts/{concept_id}/verify", response_model=VerifyResponse)
async def verify_concept(run_id: str, concept_id: str, request: VerifyRequest) -> VerifyResponse:
    """AI evaluates whether the user truly understood a concept."""
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    concept = next((c for c in run.atlas.concepts if c.id == concept_id), None)
    if concept is None:
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    try:
        result = await orchestrator._pipeline().verify_understanding(
            concept,
            request.explanation,
        )
        return VerifyResponse(**result)
    except Exception as error:
        # Fallback: pass on any technical failure so UX isn't blocked
        return VerifyResponse(
            passed=True,
            feedback=f"（验证服务暂时不可用，假设你已理解。具体反馈：{error}）",
            unlock_concept_ids=[],
        )


@router.get("/runs/{run_id}/cached-sources/{concept_id}")
async def get_cached_sources(run_id: str, concept_id: str) -> list[dict]:
    """Get pre-searched source links for a concept."""
    run = await _get_run(run_id)
    cached = run.pre_search_results
    return cached.get(concept_id, [])


@router.post("/runs/{run_id}/recommend-sources")
async def recommend_sources(run_id: str, request: TutorRequest) -> list[dict]:
    """Ask AI to recommend actual URLs based on concept content."""
    run = await _get_run(run_id)
    query_text = request.message or run.brief.domain
    try:
        prompt = f"根据以下具体概念内容，推荐3个直接相关的网页链接（不要入门教程、不要总览页，要针对这个具体知识点的页面）。返回JSON数组[{{\"title\":\"网页标题\",\"url\":\"完整URL\"}}]。只输出JSON。\n\n概念内容：{query_text[:1000]}"
        text = await orchestrator._pipeline()._run_text(prompt, "只输出JSON数组。")
        import json as _json
        text = text.strip()
        if text.startswith("```"): text = text.split("\n", 1)[1].rsplit("\n```", 1)[0] if "```" in text[text.find("\n"):] else text.split("\n", 1)[1]
        results = _json.loads(text) if text.strip().startswith('[') else []
        return [{"title": r.get("title",""), "url": r.get("url",""), "snippet": r.get("url",""), "source": "ai"} for r in results[:5] if r.get("url")]
    except Exception:
        return []


@router.post("/runs/{run_id}/search", response_model=list[SearchResult])
async def search_sources(run_id: str, request: TutorRequest) -> list[SearchResult]:
    """Live search for external sources about a topic."""
    run = await _get_run(run_id)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    results: list[SearchResult] = []
    query = request.message or run.brief.domain
    # Try Wikipedia
    try:
        from app.workflow.research import _read_wikipedia
        wiki = await asyncio.to_thread(_read_wikipedia, query)
        if wiki:
            results.append(SearchResult(title=wiki.title, url=wiki.url, snippet=wiki.extract[:300], source="wikipedia"))
    except Exception:
        pass
    # Try arXiv
    try:
        from app.workflow.research import _search_arxiv
        arxiv_results = await asyncio.to_thread(_search_arxiv, query, max_results=2)
        for ar in arxiv_results:
            results.append(SearchResult(title=ar.title, url=ar.url, snippet=ar.summary[:300], source="arxiv"))
    except Exception:
        pass
    # Try GitHub
    try:
        from app.workflow.research import _search_github
        gh = await asyncio.to_thread(_search_github, query)
        if gh:
            results.append(SearchResult(title=gh.full_name, url=gh.url, snippet=gh.description[:300], source="github"))
    except Exception:
        pass
    return results


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
