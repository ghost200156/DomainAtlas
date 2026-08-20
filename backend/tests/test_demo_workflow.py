import asyncio

from app.schemas.demo import DemoRun, FrameworkModule, LearningBrief, RunStatus
from app.store import DemoStore
from app.workflow.fixtures import make_atlas, make_plan, make_research_pack
from app.workflow.orchestrator import DemoOrchestrator
from app.workflow.research import WikipediaResult, build_research_candidates
from app.workflow.validator import repair_atlas_references, validate_atlas


def make_brief() -> LearningBrief:
    return LearningBrief(
        domain="Agent 系统设计",
        primary_intent="task_driven",
        learner_background="了解大模型基础，希望做一个比赛 Demo。",
        desired_outcome="理解 Agent 的最小工作闭环。",
        learning_time_minutes=60,
    )


def test_demo_orchestrator_builds_a_complete_atlas(tmp_path) -> None:
    async def scenario() -> None:
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(store, delay_seconds=0, agent_mode="fixture")
        run = DemoRun(id="demo-run", status=RunStatus.PREPARING_PLAN, brief=make_brief())
        await store.save(run)

        await orchestrator.prepare_plan(run.id)
        planned = await store.get(run.id)
        assert planned.status == RunStatus.WAITING_CONFIRMATION
        assert planned.plan is not None
        assert len(planned.plan.modules) == 4

        planned.status = RunStatus.GENERATING
        await store.save(planned)
        await orchestrator.generate_atlas(run.id)

        completed = await store.get(run.id)
        assert completed.status == RunStatus.READY
        assert completed.atlas is not None
        assert len(completed.atlas.concepts) == 24
        assert len(completed.atlas.relations) >= 23
        assert all(
            sum(concept.module_id == module.id for concept in completed.atlas.concepts) == 6
            for module in completed.atlas.modules
        )
        assert validate_atlas(completed.atlas) == []
        assert completed.quality_report is not None
        assert completed.quality_report.publishable is True
        assert completed.execution_mode == "fixture"
        assert completed.fallback_notes

    asyncio.run(scenario())


def test_store_returns_independent_run_snapshots(tmp_path) -> None:
    async def scenario() -> None:
        store = DemoStore(tmp_path)
        run = DemoRun(id="snapshot", status=RunStatus.PREPARING_PLAN, brief=make_brief())
        await store.save(run)

        first = await store.get(run.id)
        first.current_step = "changed-locally"
        second = await store.get(run.id)

        assert second.current_step is None

    asyncio.run(scenario())


def test_research_candidates_are_bound_to_controlled_sources(monkeypatch) -> None:
    def fake_wikipedia(query: str) -> WikipediaResult:
        return WikipediaResult(
            title=f"条目：{query}",
            url="https://zh.wikipedia.org/wiki/demo",
            extract="这是一个来自受控来源的领域摘要。它用于验证证据与模块的绑定。",
        )

    monkeypatch.setattr("app.workflow.research._read_wikipedia", fake_wikipedia)

    async def scenario() -> None:
        plan = make_plan(make_brief())
        pack = await build_research_candidates(
            make_brief().domain,
            plan,
            make_research_pack(plan),
        )

        assert len(pack.sources) == len(plan.modules)
        assert len(pack.evidence) == len(plan.modules)
        assert all(source.url.startswith("https://zh.wikipedia.org/") for source in pack.sources)
        assert {item.module_id for item in pack.evidence} == {module.id for module in plan.modules}

    asyncio.run(scenario())


def test_empty_model_atlas_is_rejected_before_publish() -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)
    atlas = make_atlas(brief, plan, research_pack)
    atlas.title = "x"
    atlas.modules = []
    atlas.concepts = []
    atlas.relations = []
    atlas.learning_path = []
    atlas.assessments = []
    atlas.sources = []

    issues = validate_atlas(atlas, research_pack)

    assert "Atlas must contain at least three modules" in issues
    assert "Atlas must contain at least 6 concepts" in issues
    assert "Atlas must retain its controlled research sources" in issues


def test_agent_system_plan_uses_domain_concepts_instead_of_generic_templates() -> None:
    brief = make_brief()
    plan = make_plan(brief)
    modules = [
        ("agent-architecture", "Agent 架构概览"),
        ("tool-calling", "工具调用机制"),
        ("state-management", "状态管理"),
        ("evaluation-loop", "评估闭环"),
        ("integration-demo", "Demo 整合实践"),
    ]
    plan.modules = [
        FrameworkModule(
            id=module_id,
            title=title,
            purpose=f"理解{title}",
            priority="core",
            core_questions=[f"{title}是什么？", f"{title}如何工作？", f"如何验证{title}？"],
        )
        for module_id, title in modules
    ]
    research_pack = make_research_pack(plan)

    atlas = make_atlas(brief, plan, research_pack)

    assert len(atlas.concepts) == 30
    assert len(atlas.relations) == 33
    assert [concept.name for concept in atlas.concepts[:3]] == ["感知—决策—行动闭环", "LLM 控制器", "任务规划"]
    assert all("·核心定义" not in concept.name for concept in atlas.concepts)
    root_id = atlas.learning_path[0].concept_ids[0]
    root_neighbors = {
        relation.target_id if relation.source_id == root_id else relation.source_id
        for relation in atlas.relations
        if root_id in (relation.source_id, relation.target_id)
    }
    assert root_neighbors == set(atlas.learning_path[0].concept_ids[1:])
    assert validate_atlas(atlas, research_pack) == []


def test_reference_repair_removes_model_generated_dangling_ids(tmp_path) -> None:
    brief = make_brief()
    plan = make_plan(brief)
    research_pack = make_research_pack(plan)

    async def scenario() -> None:
        store = DemoStore(tmp_path)
        orchestrator = DemoOrchestrator(store, delay_seconds=0, agent_mode="fixture")
        run = DemoRun(id="repair-fixture", status=RunStatus.PREPARING_PLAN, brief=brief)
        await store.save(run)
        await orchestrator.prepare_plan(run.id)
        planned = await store.get(run.id)
        planned.status = RunStatus.GENERATING
        await store.save(planned)
        await orchestrator.generate_atlas(run.id)
        completed = await store.get(run.id)
        assert completed.atlas is not None
        completed.atlas.assessments[0].related_concept_ids = ["missing-concept"]

        repairs = repair_atlas_references(completed.atlas, research_pack)

        assert repairs
        assert completed.atlas.assessments[0].related_concept_ids != ["missing-concept"]
        assert validate_atlas(completed.atlas, research_pack) == []

    asyncio.run(scenario())
