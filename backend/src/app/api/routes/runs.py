import asyncio
import json
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_controller, get_orchestrator, get_store, get_tasks
from app.schemas.demo import (
    AssessmentAttemptRequest,
    AssessmentFeedback,
    AtlasDocument,
    ConfirmPlanRequest,
    DemoRun,
    FrameworkPlan,
    LearningBrief,
    ProgressUpdateRequest,
    QuizResult,
    ReviewPath,
    RunEvent,
    RunStatus,
)
from app.schemas.learning import (
    ChatRequest,
    ExplainRequest,
    QuizAnswerRequest,
    ReviewQuestionsRequest,
    SaveChatNodeRequest,
    SaveNodeRequest,
    SaveReviewRequest,
    SuggestGoalsRequest,
    TutorRequest,
    VerifyRequest,
    VerifyResponse,
    SearchResult,
)
from app.schemas.teach import TeachAnswerRequest, TeachStepResult
from app.store import DemoStore
from app.workflow.fixtures import make_atlas, make_plan, make_research_pack
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.task_registry import TaskRegistry
from app.workflow.teaching import StudyController
from app.workflow.validator import validate_plan

router = APIRouter(prefix="/api", tags=["demo"])


async def _get_run(
    run_id: str,
    store: DemoStore = Depends(get_store),
) -> DemoRun:
    try:
        return await store.get(run_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="没有找到这个测绘任务") from error


@router.post("/runs", response_model=DemoRun, status_code=status.HTTP_202_ACCEPTED)
async def create_run(
    brief: LearningBrief,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
    tasks: TaskRegistry = Depends(get_tasks),
) -> DemoRun:
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
async def get_run(
    run_id: str,
    store: DemoStore = Depends(get_store),
) -> DemoRun:
    return await _get_run(run_id, store)


@router.post("/runs/{run_id}/clarifications", response_model=DemoRun)
async def update_brief(
    run_id: str,
    brief: LearningBrief,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
    tasks: TaskRegistry = Depends(get_tasks),
) -> DemoRun:
    run = await _get_run(run_id, store)
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
async def update_plan(
    run_id: str,
    plan: FrameworkPlan,
    store: DemoStore = Depends(get_store),
) -> DemoRun:
    run = await _get_run(run_id, store)
    issues = validate_plan(plan)
    if issues:
        raise HTTPException(status_code=422, detail=issues)
    run.plan = plan
    await store.save(run)
    return run


@router.post("/runs/{run_id}/plan/confirm", response_model=DemoRun)
async def confirm_plan(
    run_id: str,
    request: ConfirmPlanRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
    tasks: TaskRegistry = Depends(get_tasks),
) -> DemoRun:
    run = await _get_run(run_id, store)
    plan = request.plan or run.plan
    if plan is None:
        raise HTTPException(status_code=409, detail="框架计划还没有生成")
    issues = validate_plan(plan)
    if issues:
        raise HTTPException(status_code=422, detail=issues)

    run.plan = plan
    run.status = RunStatus.READY
    run.current_step = "ready"
    run.error = None
    run.research_pack = None
    run.atlas = orchestrator.init_empty_atlas(run)
    run.quality_report = None
    run.events.append(
        RunEvent(
            id=len(run.events) + 1,
            type="atlas_ready",
            step="ready",
            message="地图已初始化，标记中心节点为「已理解」即可生成第一个章节。",
        )
    )
    await store.save(run)
    return run


@router.post("/runs/{run_id}/quiz/answer", response_model=DemoRun)
async def record_quiz_answer(
    run_id: str,
    request: QuizAnswerRequest,
    store: DemoStore = Depends(get_store),
) -> DemoRun:
    """Record one quiz answer into the learner's feedback history."""
    run = await _get_run(run_id, store)
    run.quiz_results.append(
        QuizResult(
            concept_id=request.concept_id,
            question_index=request.question_index,
            selected_index=request.selected_index,
            correct=request.correct,
        )
    )
    await store.save(run)
    return run


@router.post("/runs/{run_id}/explain")
async def explain(
    run_id: str,
    request: ExplainRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Point-and-read: explain a question about a specific node (with atlas context)."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    concept = next((c for c in run.atlas.concepts if c.id == request.concept_id), None)
    if concept is None:
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    try:
        reply = await orchestrator.pipeline().tutor_chat(run.atlas, concept, request.question)
        return {"reply": reply}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"解释失败：{error}") from error


@router.post("/runs/{run_id}/expand-question")
async def expand_question(
    run_id: str,
    request: ReviewQuestionsRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Generate selectable「哪里不理解」options for a concept (agent-judged)."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    concept = next((c for c in run.atlas.concepts if c.id == request.concept_id), None)
    if concept is None:
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    try:
        options = await orchestrator.pipeline().generate_expand_options(run.brief, concept)
        return {"options": options}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"生成提问失败：{error}") from error


@router.post("/runs/{run_id}/expand")
async def expand_node(
    run_id: str,
    request: ExplainRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Deepen a concept: explain the learner's confusion, quiz it, auto-save the sub-node."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    if not any(c.id == request.concept_id for c in run.atlas.concepts):
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    try:
        return await orchestrator.expand_node(run_id, request.concept_id, request.question)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"拓展失败：{error}") from error


@router.post("/runs/{run_id}/explain-free")
async def explain_free(
    run_id: str,
    request: TutorRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Free-form explanation in the domain context (no selected node)."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    try:
        reply = await orchestrator.pipeline().explain_free(run.brief, run.atlas, request.message)
        return {"reply": reply}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"讲解失败：{error}") from error


@router.post("/runs/{run_id}/save-node", response_model=DemoRun)
async def save_node(
    run_id: str,
    request: SaveNodeRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> DemoRun:
    """Turn a teaching-session Q&A into a reusable map node."""
    return await orchestrator.save_node(run_id, request.question, request.answer)


@router.post("/runs/{run_id}/chat")
async def chat(
    run_id: str,
    request: ChatRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Answer a question; the agent may auto-summarize the prior segment into a node."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    return await orchestrator.chat(run_id, request.question, request.history)


@router.post("/runs/{run_id}/review-questions")
async def review_questions(
    run_id: str,
    request: ReviewQuestionsRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Generate practice questions for a weak concept (shown in the teaching session)."""
    try:
        return await orchestrator.review_questions(run_id, request.concept_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/runs/{run_id}/save-review", response_model=DemoRun)
async def save_review(
    run_id: str,
    request: SaveReviewRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> DemoRun:
    """Persist an answered review as a node."""
    return await orchestrator.save_review(
        run_id, request.concept_id, request.concept_name, request.questions
    )


@router.post("/runs/{run_id}/save-chat-node", response_model=DemoRun)
async def save_chat_node(
    run_id: str,
    request: SaveChatNodeRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> DemoRun:
    """Persist a user-approved node from a chat summary."""
    return await orchestrator.persist_node(run_id, request.name, request.definition)


@router.post("/suggest-questions")
async def suggest_questions(
    request: SuggestGoalsRequest,
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Generate domain-specific interview options (goals + backgrounds)."""
    try:
        return await orchestrator.pipeline().suggest_questions(request.domain)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"生成选项失败：{error}") from error


@router.post("/runs/{run_id}/grow", response_model=DemoRun)
async def grow_node(
    run_id: str,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> DemoRun:
    """Generate the next chapter node and auto-link it. One node per call."""
    try:
        return await orchestrator.grow_node(run_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/runs/{run_id}/retry", response_model=DemoRun, status_code=202)
async def retry_run(
    run_id: str,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
    tasks: TaskRegistry = Depends(get_tasks),
) -> DemoRun:
    run = await _get_run(run_id, store)
    if run.status != RunStatus.FAILED:
        raise HTTPException(status_code=409, detail="只有失败的任务可以重试")

    run.error = None
    if run.plan is None:
        run.status = RunStatus.PREPARING_PLAN
        await store.save(run)
        tasks.start(f"prepare:{run.id}", orchestrator.prepare_plan(run.id))
    else:
        run.status = RunStatus.READY
        run.current_step = "ready"
        run.atlas = orchestrator.init_empty_atlas(run)
        await store.save(run)
    return run


@router.get("/runs/{run_id}/atlas", response_model=AtlasDocument)
async def get_atlas(
    run_id: str,
    store: DemoStore = Depends(get_store),
) -> AtlasDocument:
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    return run.atlas


@router.patch("/runs/{run_id}/progress/{concept_id}", response_model=DemoRun)
async def update_progress(
    run_id: str,
    concept_id: str,
    request: ProgressUpdateRequest,
    store: DemoStore = Depends(get_store),
) -> DemoRun:
    run = await _get_run(run_id, store)
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
    store: DemoStore = Depends(get_store),
) -> AssessmentFeedback:
    run = await _get_run(run_id, store)
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
async def generate_review_path(
    run_id: str,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> ReviewPath:
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    if not run.assessment_results and not run.progress:
        raise HTTPException(status_code=409, detail="请先完成至少一次自测或标记学习进度")

    try:
        return await orchestrator.pipeline().review_path(
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
    store: DemoStore = Depends(get_store),
) -> StreamingResponse:
    await _get_run(run_id, store)

    async def event_stream() -> AsyncIterator[str]:
        cursor = last_event_id
        while True:
            run = await _get_run(run_id, store)
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
async def tutor_chat(
    run_id: str,
    request: TutorRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> dict:
    """Chat with an AI tutor that has full atlas context."""
    run = await _get_run(run_id, store)
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
        reply = await orchestrator.pipeline().tutor_chat(
            run.atlas,
            concept,
            request.message,
        )
        return {"reply": reply}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"导师回复失败：{error}") from error


@router.post("/runs/{run_id}/teach/next", response_model=TeachStepResult)
async def teach_next(
    run_id: str,
    request: TeachAnswerRequest | None = None,
    store: DemoStore = Depends(get_store),
    controller: StudyController = Depends(get_controller),
) -> TeachStepResult:
    """Advance the bounded teaching loop by one step.

    With no body: decide and execute the next action. With ``{answer}`` and a
    pending practice question: grade the answer, update the learner model, and
    return the result. The controller proposes; governance validates; state is
    persisted on the run.
    """
    answer = request.answer if request else None
    try:
        return await controller.next_step(run_id, answer)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/runs/{run_id}/concepts/{concept_id}/verify", response_model=VerifyResponse)
async def verify_concept(
    run_id: str,
    concept_id: str,
    request: VerifyRequest,
    store: DemoStore = Depends(get_store),
    orchestrator: DemoOrchestrator = Depends(get_orchestrator),
) -> VerifyResponse:
    """AI evaluates whether the user truly understood a concept."""
    run = await _get_run(run_id, store)
    if run.atlas is None:
        raise HTTPException(status_code=409, detail="领域地图还没有生成")
    concept = next((c for c in run.atlas.concepts if c.id == concept_id), None)
    if concept is None:
        raise HTTPException(status_code=404, detail="没有找到这个概念")
    try:
        result = await orchestrator.pipeline().verify_understanding(
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
async def get_cached_sources(
    run_id: str,
    concept_id: str,
    store: DemoStore = Depends(get_store),
) -> list[dict]:
    """Get pre-searched source links for a concept."""
    run = await _get_run(run_id, store)
    cached = run.pre_search_results
    return cached.get(concept_id, [])


@router.post("/runs/{run_id}/search", response_model=list[SearchResult])
async def search_sources(
    run_id: str,
    request: TutorRequest,
    store: DemoStore = Depends(get_store),
) -> list[SearchResult]:
    """Live search for external sources about a topic."""
    run = await _get_run(run_id, store)
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
