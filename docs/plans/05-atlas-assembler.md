# Plan 05 — 提取 AtlasAssembler：把领域组装从 pipeline 分离

> 状态：**未开始**。实施时必须保留 Plan 01/02 已建立的 evidence 映射、模块并行、
> 独立 fallback、取消传播和 overview 降级语义；本文伪代码仅表达边界，不应直接复制。

## 问题

`LiveAgentPipeline.build_atlas()` 混合了两种完全不同的工作：

1. **LLM 调用**：调 `_build_concepts()` 让模型生成概念内容
2. **领域组装**：构造 `ConceptRelation` 图、中心节点、颜色分配、拼装 `AtlasDocument`

后者是纯 Python 逻辑，不需要 LLM，但现在藏在 Pipeline 里无法独立测试。

## 目标

- `AtlasAssembler` 负责所有纯 Python 的领域组装，接口为纯函数
- `LiveAgentPipeline.build_atlas()` 只负责 LLM 调用，把结果交给 Assembler
- 关系图算法、颜色策略可以不依赖 LLM 单独测试

## 涉及文件

- 新建 `backend/src/app/workflow/atlas_assembler.py`
- `backend/src/app/workflow/agents_per_module.py`

## 实现步骤

### 1. 新建 `atlas_assembler.py`

```python
# backend/src/app/workflow/atlas_assembler.py
from app.schemas.demo import (
    AtlasDocument, AtlasModule, AtlasOverview,
    ConceptNode, ConceptRelation, FrameworkPlan,
    LearningBrief, ResearchPack,
)

_COLORS = ["#2f7f73", "#4e7896", "#d49a45", "#e46f46", "#776a9b", "#6d8b55"]


def assemble(
    brief: LearningBrief,
    plan: FrameworkPlan,
    concepts_by_module: dict[str, list[ConceptNode]],
    research_pack: ResearchPack,
    center_text: str | None = None,
) -> AtlasDocument:
    all_concepts = []
    for m in plan.modules:
        all_concepts.extend(concepts_by_module.get(m.id, []))

    atlas_modules = [
        AtlasModule(id=m.id, title=m.title, summary=m.purpose, color=_COLORS[i % 6])
        for i, m in enumerate(plan.modules)
    ]

    overview = AtlasOverview(
        definition=plan.domain_definition,
        boundary=plan.scope,
        essential_question=f"如何在{brief.learning_time_minutes}分钟内理解{brief.domain}？",
        key_takeaways=[m.title for m in plan.modules[:4]],
    )

    center = ConceptNode(
        id="__center__", module_id="__center__",
        name=brief.domain,
        definition=(center_text or plan.domain_definition)[:500],
        why_it_matters=brief.desired_outcome,
        key_points=(plan.completion_criteria or [])[:5],
        example=None, evidence_ids=[],
    )
    all_concepts.insert(0, center)

    relations = _build_relations(plan, all_concepts, center)

    return AtlasDocument(
        title=f"{brief.domain} · 学习地图",
        overview=overview,
        modules=atlas_modules,
        concepts=all_concepts,
        relations=relations,
        mechanisms=[], cases=[], learning_path=[], assessments=[],
        sources=research_pack.sources,
        gaps=research_pack.gaps,
    )


def _build_relations(plan, all_concepts, center) -> list[ConceptRelation]:
    relations = []
    rid = 0
    for mod in plan.modules:
        mod_concepts = [c for c in all_concepts if c.module_id == mod.id]
        if not mod_concepts:
            continue
        module_root = mod_concepts[0]
        relations.append(ConceptRelation(
            id=f"r{rid}", source_id=center.id, target_id=module_root.id,
            relation_type="informs", explanation="",
        ))
        rid += 1
        for leaf in mod_concepts[1:]:
            relations.append(ConceptRelation(
                id=f"r{rid}", source_id=module_root.id, target_id=leaf.id,
                relation_type="informs", explanation="",
            ))
            rid += 1
    return relations
```

### 2. `build_atlas()` 改为只做 LLM 调用，结果交给 Assembler

```python
async def build_atlas(self, brief, plan, research_pack):
    evidence_by_module = {}
    for e in research_pack.evidence:
        evidence_by_module.setdefault(e.module_id, []).append(e)

    concept_tasks = [
        self._build_concepts(brief, m.id, m.title, m.purpose,
                             m.core_questions, evidence_by_module.get(m.id, []))
        for m in plan.modules
    ]
    overview_task = self._run_text("撰写学习概览(200-300字)...", "课程设计师。")

    concept_results, center_text_raw = await asyncio.gather(
        asyncio.gather(*concept_tasks),
        overview_task,
        return_exceptions=True,
    )

    concepts_by_module = {
        m.id: cs
        for m, cs in zip(plan.modules, concept_results)
        if isinstance(cs, list)
    }
    center_text = center_text_raw if isinstance(center_text_raw, str) else None

    return assemble(brief, plan, concepts_by_module, research_pack, center_text)
```

## 验收标准

- `AtlasAssembler.assemble()` 是纯函数，无 async，无 LLM 依赖
- 给定固定的 `concepts_by_module`，断言返回的 `AtlasDocument` 有正确的 relations 图
- `build_atlas()` 行数 < 30 行

## 优先级

🟡 中——代码组织，不影响功能
