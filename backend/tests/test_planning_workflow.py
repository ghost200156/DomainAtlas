import asyncio

from app.ai import (
    AttemptDiagnostics,
    GenerationDiagnostics,
    GenerationFailure,
    GenerationSuccess,
    OutputStrategy,
    OutputValidationExhausted,
    TransientProviderError,
)
from app.core.config import Settings
from app.schemas.demo import DemoRun, PlanningOutput, RunStatus
from app.store import DemoStore
from app.workflow.fixtures import make_calibration, make_plan
from app.workflow.orchestrator import DemoOrchestrator

from test_demo_workflow import make_brief


def live_settings(*, mode: str = "auto") -> Settings:
    return Settings(
        openai_api_base="https://provider.example/v1",
        openai_api_key="test-key",
        openai_model="test-model",
        demo_agent_mode=mode,
    )


def diagnostics(
    *,
    error_category: str | None = None,
) -> GenerationDiagnostics:
    return GenerationDiagnostics(
        duration_seconds=0.01,
        attempts=(
            AttemptDiagnostics(
                strategy=OutputStrategy.TOOL_OUTPUT,
                duration_seconds=0.01,
                error_category=error_category,
                sanitized_error_message="sanitized failure" if error_category else None,
            ),
        ),
    )


def run_prepare_plan(tmp_path, monkeypatch, *, mode: str, result):
    async def fake_generate_planning(brief, settings):
        assert brief == make_brief()
        assert settings.openai_model == "test-model"
        return result

    monkeypatch.setattr(
        "app.workflow.orchestrator.generate_planning",
        fake_generate_planning,
    )

    async def scenario():
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(
            store,
            delay_seconds=0,
            agent_mode=mode,
            settings=live_settings(mode=mode),
        )
        run = DemoRun(
            id=f"planning-{mode}",
            status=RunStatus.PREPARING_PLAN,
            brief=make_brief(),
        )
        await store.save(run)

        await orchestrator.prepare_plan(run.id)
        return await store.get(run.id)

    return asyncio.run(scenario())


def test_planning_live_success_uses_generated_output(tmp_path, monkeypatch) -> None:
    brief = make_brief()
    calibration = make_calibration(brief)
    calibration.interpretation = "model calibration"
    plan = make_plan(brief)
    plan.goal_summary = "model plan"
    result = GenerationSuccess(
        output=PlanningOutput(calibration=calibration, plan=plan),
        diagnostics=diagnostics(),
    )

    planned = run_prepare_plan(
        tmp_path,
        monkeypatch,
        mode="live",
        result=result,
    )

    assert planned.status == RunStatus.WAITING_CONFIRMATION
    assert planned.execution_mode == "live"
    assert planned.model_name == "test-model"
    assert planned.calibration == calibration
    assert planned.plan == plan
    assert planned.fallback_notes == []
    assert not any(event.type == "fallback" for event in planned.events)
    assert planned.events[-1].type == "plan_ready"


def test_planning_auto_failure_uses_hybrid_fixture_and_records_fallback(
    tmp_path,
    monkeypatch,
) -> None:
    error = TransientProviderError("provider temporarily unavailable", http_status=503)
    result = GenerationFailure(
        error=error,
        diagnostics=diagnostics(error_category=error.category),
    )

    planned = run_prepare_plan(
        tmp_path,
        monkeypatch,
        mode="auto",
        result=result,
    )

    assert planned.status == RunStatus.WAITING_CONFIRMATION
    assert planned.execution_mode == "hybrid"
    assert planned.calibration == make_calibration(planned.brief)
    assert planned.plan == make_plan(planned.brief)
    assert planned.fallback_notes == ["planning 调用暂时不可用，已使用演示资料继续。"]
    fallback_events = [event for event in planned.events if event.type == "fallback"]
    assert len(fallback_events) == 1
    assert fallback_events[0].step == "planning"
    assert fallback_events[0].message == planned.fallback_notes[0]


def test_planning_live_failure_marks_run_failed(tmp_path, monkeypatch) -> None:
    error = TransientProviderError("provider temporarily unavailable", http_status=503)
    result = GenerationFailure(
        error=error,
        diagnostics=diagnostics(error_category=error.category),
    )

    planned = run_prepare_plan(
        tmp_path,
        monkeypatch,
        mode="live",
        result=result,
    )

    assert planned.status == RunStatus.FAILED
    assert planned.current_step == "planning"
    assert planned.error is not None
    assert planned.error.code == "DEMO_PIPELINE_FAILED"
    assert planned.error.failed_step == "planning"
    assert planned.calibration is None
    assert planned.plan is None
    assert planned.fallback_notes == []
    assert not any(event.type == "fallback" for event in planned.events)
    assert planned.events[-1].type == "error"


def test_planning_output_retry_exhausted_uses_workflow_fixture(
    tmp_path,
    monkeypatch,
) -> None:
    error = OutputValidationExhausted("structured output retries exhausted")
    result = GenerationFailure(
        error=error,
        diagnostics=diagnostics(error_category=error.category),
    )

    planned = run_prepare_plan(
        tmp_path,
        monkeypatch,
        mode="auto",
        result=result,
    )

    assert planned.status == RunStatus.WAITING_CONFIRMATION
    assert planned.execution_mode == "hybrid"
    assert planned.plan == make_plan(planned.brief)
    assert any(event.type == "fallback" for event in planned.events)


def test_planning_fixture_mode_does_not_call_generation(tmp_path, monkeypatch) -> None:
    async def unexpected_generate_planning(brief, settings):
        raise AssertionError("fixture mode must not call app.ai.generate_planning")

    monkeypatch.setattr(
        "app.workflow.orchestrator.generate_planning",
        unexpected_generate_planning,
    )

    async def scenario():
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(
            store,
            delay_seconds=0,
            agent_mode="fixture",
            settings=Settings(demo_agent_mode="fixture"),
        )
        run = DemoRun(
            id="planning-fixture",
            status=RunStatus.PREPARING_PLAN,
            brief=make_brief(),
        )
        await store.save(run)

        await orchestrator.prepare_plan(run.id)
        return await store.get(run.id)

    planned = asyncio.run(scenario())

    assert planned.status == RunStatus.WAITING_CONFIRMATION
    assert planned.execution_mode == "fixture"
    assert planned.model_name is None
    assert planned.calibration == make_calibration(planned.brief)
    assert planned.plan == make_plan(planned.brief)
    assert planned.fallback_notes == ["当前未启用真实模型，使用稳定演示资料。"]
    assert any(event.type == "fallback" for event in planned.events)
