import asyncio
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.schemas.demo import (
    ConceptNode,
    DemoRun,
    EvidenceItem,
    LearningBrief,
    RunStatus,
    Source,
)
from app.store import DemoStore
from app.workflow import agents_per_module
from app.workflow.fixtures import make_atlas, make_plan, make_research_pack
from app.workflow.orchestrator import DemoOrchestrator


def make_brief() -> LearningBrief:
    return LearningBrief(
        domain="Agent 系统设计",
        primary_intent="task_driven",
        learner_background="了解大模型基础，希望做一个比赛 Demo。",
        desired_outcome="理解 Agent 的最小工作闭环。",
        learning_time_minutes=60,
    )


def make_concept(module_id: str, name: str) -> ConceptNode:
    return ConceptNode(
        id=f"{module_id}-c0",
        module_id=module_id,
        name=name,
        definition="定义",
        why_it_matters="用途",
        key_points=["规则"],
        example="例题",
    )


def test_build_atlas_runs_modules_and_overview_in_parallel(monkeypatch) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    pipeline = object.__new__(agents_per_module.LiveAgentPipeline)
    started = 0
    all_started = asyncio.Event()

    async def wait_for_all_requests() -> None:
        nonlocal started
        started += 1
        if started == len(plan.modules) + 1:
            all_started.set()
        await asyncio.wait_for(all_started.wait(), timeout=1)

    async def build_concepts(_brief, module_id, module_title, _purpose, _questions, evidence=None):
        await wait_for_all_requests()
        return [make_concept(module_id, module_title)]

    async def run_text(_prompt, _sys_prompt):
        await wait_for_all_requests()
        return "并行生成的概览"

    monkeypatch.setattr(pipeline, "_build_concepts", build_concepts)
    monkeypatch.setattr(pipeline, "_run_text", run_text)

    async def scenario() -> None:
        atlas = await asyncio.wait_for(
            pipeline.build_atlas(brief, plan, research_pack),
            timeout=1,
        )
        assert atlas.concepts[0].definition == "并行生成的概览"
        assert {concept.module_id for concept in atlas.concepts[1:]} == {
            module.id for module in plan.modules
        }

    asyncio.run(scenario())


def test_run_agent_allows_four_modules_and_overview_in_one_wave() -> None:
    pipeline = agents_per_module.LiveAgentPipeline(Settings(), timeout_seconds=1)
    request_count = 5
    active = 0
    peak_active = 0
    started = 0
    all_started = asyncio.Event()

    class TrackingAgent:
        async def run(self, _prompt):
            nonlocal active, peak_active, started
            active += 1
            peak_active = max(peak_active, active)
            started += 1
            if started == request_count:
                all_started.set()
            try:
                await asyncio.wait_for(all_started.wait(), timeout=1)
            finally:
                active -= 1
            return SimpleNamespace(output="ok")

    async def scenario() -> None:
        results = await asyncio.gather(*[
            pipeline._run_agent(TrackingAgent(), f"request-{index}", timeout=1)
            for index in range(request_count)
        ])
        assert results == ["ok"] * request_count

    asyncio.run(scenario())
    assert peak_active == request_count


def test_run_agent_respects_a_lower_provider_concurrency_limit() -> None:
    pipeline = agents_per_module.LiveAgentPipeline(
        Settings(),
        timeout_seconds=1,
        max_concurrent_requests=2,
    )
    active = 0
    peak_active = 0
    started = 0
    first_wave_started = asyncio.Event()
    release = asyncio.Event()

    class TrackingAgent:
        async def run(self, _prompt):
            nonlocal active, peak_active, started
            active += 1
            peak_active = max(peak_active, active)
            started += 1
            if started == 2:
                first_wave_started.set()
            try:
                await release.wait()
            finally:
                active -= 1
            return SimpleNamespace(output="ok")

    async def scenario() -> None:
        tasks = [
            asyncio.create_task(pipeline._run_agent(TrackingAgent(), f"request-{index}", timeout=1))
            for index in range(5)
        ]
        await asyncio.wait_for(first_wave_started.wait(), timeout=1)
        assert active == 2
        assert peak_active == 2
        release.set()
        assert await asyncio.gather(*tasks) == ["ok"] * 5

    asyncio.run(scenario())
    assert peak_active == 2


def test_build_atlas_isolates_module_and_overview_failures(monkeypatch) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    pipeline = object.__new__(agents_per_module.LiveAgentPipeline)
    failed_module = plan.modules[0]

    async def build_concepts(_brief, module_id, module_title, _purpose, _questions, evidence=None):
        if module_id == failed_module.id:
            raise RuntimeError("module provider failure")
        return [make_concept(module_id, module_title)]

    async def run_text(_prompt, _sys_prompt):
        raise TimeoutError("overview timeout")

    monkeypatch.setattr(pipeline, "_build_concepts", build_concepts)
    monkeypatch.setattr(pipeline, "_run_text", run_text)

    async def scenario() -> None:
        atlas = await pipeline.build_atlas(brief, plan, research_pack)
        module_concepts = {
            concept.module_id: concept
            for concept in atlas.concepts
            if concept.module_id != "__center__"
        }
        assert set(module_concepts) == {
            module.id for module in plan.modules if module.id != failed_module.id
        }
        assert atlas.concepts[0].definition == plan.domain_definition

    asyncio.run(scenario())


def test_text_timeout_and_token_budget_are_conservative() -> None:
    pipeline = agents_per_module.LiveAgentPipeline(Settings(), timeout_seconds=180)

    assert pipeline.text_timeout == 90
    assert pipeline.concept_settings["max_tokens"] == 8192
    assert pipeline.structured_settings["max_tokens"] == 4096
    assert pipeline.text_settings["max_tokens"] == 2048
    assert pipeline.concept_settings is not pipeline.structured_settings
    assert pipeline.structured_settings is not pipeline.text_settings
    assert pipeline.concept_settings["extra_body"] is not pipeline.structured_settings["extra_body"]
    assert pipeline.structured_settings["extra_body"] is not pipeline.text_settings["extra_body"]


def test_agent_methods_pass_their_own_model_settings(monkeypatch) -> None:
    pipeline = agents_per_module.LiveAgentPipeline(Settings(), timeout_seconds=1)
    captured_settings = []
    captured_system_prompts = []

    class CapturingAgent:
        def __init__(self, *args, **kwargs):
            captured_settings.append(kwargs["model_settings"])
            captured_system_prompts.append(kwargs["system_prompt"])

        async def run(self, _prompt):
            return SimpleNamespace(output=SimpleNamespace(concepts=[]))

    async def no_sleep(_delay: float) -> None:
        return None

    monkeypatch.setattr(agents_per_module, "Agent", CapturingAgent)
    monkeypatch.setattr(agents_per_module.asyncio, "sleep", no_sleep)

    async def scenario() -> None:
        await pipeline._run(object, "structured", "structured prompt")
        await pipeline._run_text("short text prompt")
        with pytest.raises(
            RuntimeError,
            match="concept generation failed after 2 attempts",
        ):
            await pipeline._build_concepts(
                make_brief(),
                "module-a",
                "模块 A",
                "模块用途",
                ["核心问题"],
            )

    asyncio.run(scenario())
    assert captured_settings[0] is pipeline.structured_settings
    assert captured_settings[1] is pipeline.text_settings
    assert captured_settings[2] is pipeline.concept_settings
    assert captured_settings[3] is pipeline.concept_settings
    assert all(settings["extra_body"]["thinking"]["type"] == "disabled" for settings in captured_settings)
    assert captured_system_prompts[2] == agents_per_module.CONCEPT_SYSTEM_PROMPT
    assert captured_system_prompts[3] == agents_per_module.CONCEPT_SYSTEM_PROMPT
    assert "RISC-V" not in captured_system_prompts[2]
    assert "当前领域" in captured_system_prompts[2]
    assert "evidence ID" in captured_system_prompts[2]
    assert "【解】" in captured_system_prompts[2]


def test_build_concepts_retries_twice_then_raises_last_error(monkeypatch) -> None:
    brief = make_brief()
    pipeline = object.__new__(agents_per_module.LiveAgentPipeline)
    pipeline.model = object()
    pipeline.concept_settings = {
        "max_tokens": 8192,
        "extra_body": {"thinking": {"type": "disabled"}},
    }
    pipeline._skill_registry = None
    pipeline.text_timeout = 0.01
    pipeline._request_semaphore = asyncio.Semaphore(1)
    calls = 0
    sleeps: list[float] = []

    class FailingAgent:
        def __init__(self, *args, **kwargs):
            pass

        async def run(self, _prompt):
            nonlocal calls
            calls += 1
            raise TimeoutError("concept timeout")

    async def no_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(agents_per_module, "Agent", FailingAgent)
    monkeypatch.setattr(agents_per_module.asyncio, "sleep", no_sleep)

    async def scenario() -> None:
        with pytest.raises(
            RuntimeError,
            match="Module module-a concept generation failed after 2 attempts",
        ) as exc_info:
            await pipeline._build_concepts(
                brief,
                "module-a",
                "模块 A",
                "模块用途",
                ["核心问题"],
            )
        assert isinstance(exc_info.value.__cause__, TimeoutError)

    asyncio.run(scenario())
    assert calls == 2
    assert sleeps == [2]


def test_build_atlas_raises_when_all_modules_fail(monkeypatch) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    pipeline = object.__new__(agents_per_module.LiveAgentPipeline)

    async def build_concepts(*args, **kwargs):
        raise RuntimeError("module provider failure")

    async def run_text(_prompt, _sys_prompt):
        return "overview"

    monkeypatch.setattr(pipeline, "_build_concepts", build_concepts)
    monkeypatch.setattr(pipeline, "_run_text", run_text)

    async def scenario() -> None:
        failed_modules = [module.id for module in plan.modules]
        with pytest.raises(RuntimeError) as exc_info:
            await pipeline.build_atlas(brief, plan, research_pack)
        assert str(exc_info.value) == f"All modules failed: {failed_modules}"

    asyncio.run(scenario())


def test_generate_atlas_stops_after_three_attempts(monkeypatch, tmp_path) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    attempts = 0
    sleeps: list[float] = []

    class FailingPipeline:
        async def build_atlas(self, _brief, _plan, _research_pack):
            nonlocal attempts
            attempts += 1
            raise RuntimeError("atlas provider failure")

    async def candidate_pack(*args, **kwargs):
        return research_pack

    async def no_extra_search(*args, **kwargs):
        return [], []

    async def no_sleep(delay: float) -> None:
        sleeps.append(delay)

    async def no_finish(_run_id: str) -> None:
        return None

    monkeypatch.setattr("app.workflow.orchestrator.build_research_candidates", candidate_pack)
    monkeypatch.setattr("app.workflow.orchestrator.search_multi_source", no_extra_search)
    monkeypatch.setattr("app.workflow.orchestrator.asyncio.sleep", no_sleep)

    async def scenario() -> None:
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(store, delay_seconds=0, agent_mode="live")
        monkeypatch.setattr(orchestrator, "_can_run_live", lambda: True)
        monkeypatch.setattr(orchestrator, "pipeline", lambda: FailingPipeline())
        monkeypatch.setattr(orchestrator, "finish_atlas", no_finish)
        run = DemoRun(
            id="retry-limit",
            status=RunStatus.GENERATING,
            brief=brief,
            plan=plan,
        )
        await store.save(run)

        await orchestrator.generate_atlas(run.id)

        failed = await store.get(run.id)
        assert failed.status == RunStatus.FAILED

    asyncio.run(scenario())
    assert attempts == 3
    assert sleeps == [2, 2]


def test_finish_atlas_fails_without_real_concepts(tmp_path) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    atlas = make_atlas(brief, plan, research_pack)
    atlas.concepts = [
        concept for concept in atlas.concepts if concept.module_id == "__center__"
    ]

    async def scenario() -> None:
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(store, delay_seconds=0, agent_mode="fixture")
        run = DemoRun(
            id="no-real-concepts",
            status=RunStatus.GENERATING,
            brief=brief,
            plan=plan,
            research_pack=research_pack,
            atlas=atlas,
        )
        await store.save(run)

        await orchestrator.finish_atlas(run.id)

        failed = await store.get(run.id)
        assert failed.status == RunStatus.FAILED
        assert failed.current_step == "publishing"

    asyncio.run(scenario())


def test_generate_atlas_persists_multi_source_enrichment_before_reload(
    monkeypatch,
    tmp_path,
) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    module_id = plan.modules[0].id
    extra_source = Source(
        id="extra-source",
        title="Extra source",
        url="https://example.com/extra",
        publisher="Example",
        trust_tier="B",
    )
    extra_evidence = EvidenceItem(
        id="extra-evidence",
        source_id=extra_source.id,
        module_id=module_id,
        statement="Extra evidence statement.",
        excerpt="Extra evidence excerpt.",
        evidence_type="fact",
        confidence="medium",
    )
    observed_source_ids: set[str] = set()
    observed_evidence_ids: set[str] = set()

    class CapturingPipeline:
        async def build_atlas(self, candidate_brief, candidate_plan, candidate_pack):
            observed_source_ids.update(source.id for source in candidate_pack.sources)
            observed_evidence_ids.update(item.id for item in candidate_pack.evidence)
            return make_atlas(candidate_brief, candidate_plan, candidate_pack)

    async def candidate_pack(*args, **kwargs):
        return research_pack

    async def enriched_search(*args, **kwargs):
        return [extra_source], [extra_evidence]

    async def no_finish(_run_id: str) -> None:
        return None

    monkeypatch.setattr("app.workflow.orchestrator.build_research_candidates", candidate_pack)
    monkeypatch.setattr("app.workflow.orchestrator.search_multi_source", enriched_search)

    async def scenario() -> None:
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(store, delay_seconds=0, agent_mode="live")
        monkeypatch.setattr(orchestrator, "_can_run_live", lambda: True)
        monkeypatch.setattr(orchestrator, "pipeline", lambda: CapturingPipeline())
        monkeypatch.setattr(orchestrator, "finish_atlas", no_finish)
        run = DemoRun(
            id="persist-enrichment",
            status=RunStatus.GENERATING,
            brief=brief,
            plan=plan,
        )
        await store.save(run)

        await orchestrator.generate_atlas(run.id)

        persisted = await store.get(run.id)
        assert persisted.research_pack is not None
        assert extra_source.id in {source.id for source in persisted.research_pack.sources}
        assert extra_evidence.id in {item.id for item in persisted.research_pack.evidence}

    asyncio.run(scenario())
    assert extra_source.id in observed_source_ids
    assert extra_evidence.id in observed_evidence_ids
