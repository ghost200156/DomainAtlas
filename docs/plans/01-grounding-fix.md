# Plan 01 — Grounding 修复：把 evidence 注入概念生成

> 状态：**已完成**（2026-08-19）  
> 主要实现：`7a6d02a`；后续补充了多来源 enrichment 的即时持久化修复。

本文的“问题”描述的是修复前基线，不代表当前实现。

## 问题

`_build_concepts()` 生成概念时完全忽略了 `ResearchPack.evidence`。
概念的 prompt 只有 brief 和模块元数据，生成的 `ConceptNode.evidence_ids` 全是空数组。

搜索结果（Wikipedia / arXiv / GitHub）和概念内容之间没有任何因果关系。
Atlas 展示的来源列表无法证明它支撑了任何概念内容。

## 目标

- `_build_concepts()` 接收对应模块的 evidence，注入 prompt
- 生成的 `ConceptNode.evidence_ids` 包含实际引用的 evidence ID
- 来源和概念之间建立可追溯的链接

## 涉及文件

- `backend/src/app/workflow/agents_per_module.py` — `_build_concepts()` 和 `build_atlas()`
- `backend/src/app/workflow/orchestrator.py` — 多来源 enrichment 合并后的持久化
- `backend/tests/test_agents_per_module.py` — grounding、引用有效性和持久化回归测试

## 实现步骤

### 1. `build_atlas()` 按模块过滤 evidence 并传入

```python
async def build_atlas(self, brief, plan, research_pack):
    # 按 module_id 建索引
    evidence_by_module = {}
    for e in research_pack.evidence:
        evidence_by_module.setdefault(e.module_id, []).append(e)

    tasks = [
        self._build_concepts(
            brief, m.id, m.title, m.purpose, m.core_questions,
            evidence=evidence_by_module.get(m.id, [])   # ← 新增
        )
        for m in plan.modules
    ]
    results = await asyncio.gather(*tasks)
    ...
```

### 2. `_build_concepts()` 签名加 evidence 参数

```python
async def _build_concepts(self, brief, module_id, module_title,
                           module_purpose, core_questions,
                           evidence: list = None):
```

### 3. 把 evidence 摘要拼进 prompt

```python
evidence_block = ""
if evidence:
    lines = [f"- {e.id} [{e.confidence}] {e.statement}" for e in evidence[:5]]
    evidence_block = "\n\n参考证据：\n" + "\n".join(lines)

prompt = (
    "领域：" + brief.domain +
    " 学习者：" + brief.learner_background +
    " 模块：" + module_title + "（" + module_purpose + "）" +
    " 核心问题：" + str(core_questions) +
    evidence_block   # ← 注入
)
```

### 4. `MiniConcept` 加 `evidence_ids` 字段，要求模型引用

```python
class MiniConcept(BaseModel):
    ...
    evidence_ids: list[str] = Field(
        default=[],
        description="本概念引用的 evidence ID 列表，从上方参考证据中选取"
    )
```

### 5. 把模型返回的 `evidence_ids` 写入 `ConceptNode`

```python
concepts.append(ConceptNode(
    ...
    evidence_ids=item.evidence_ids or [],
))
```

### 6. 修复多来源 enrichment 的保存时序

`search_multi_source()` 返回的新 `sources` 和 `evidence` 合并进 run 后立即执行
`store.save(run)`。此前合并结果只存在于内存对象中，后续重新 `get(run_id)` 会读回旧文件，
导致增强证据丢失，Atlas 生成仍然只能看到初始候选资料。

这项修复保证传给 `build_atlas()` 的 `ResearchPack` 与磁盘中的 run 状态一致。

## 实际落地结果

- `build_atlas()` 按 `module_id` 建立 evidence 索引，每个模块最多注入 5 条相关证据。
- prompt 同时包含 evidence ID、confidence 和 statement。
- 模型返回的 `evidence_ids` 写入 `ConceptNode`，发布前由现有 validator 检查引用。
- 模块没有可用 evidence 时仍允许空引用，不影响 fixture/fallback 路径。
- 多来源搜索增强结果在重新读取 run 前已经持久化，不再发生 save 丢失。

## 验收标准

- [x] 有外部搜索结果时，生成结果可以返回非空 `evidence_ids`
- [x] `evidence_ids` 里的 ID 能在 `research_pack.evidence` 里找到对应项
- [x] fixture 模式（无搜索结果）不报错，`evidence_ids` 为空数组
- [x] 多来源 enrichment 在后续 reload 前持久化

相关回归测试位于 `backend/tests/test_agents_per_module.py`。当前 live benchmark 的两轮
Atlas 生成分别得到 8 和 6 个 evidence 引用，均无 fallback。

## 优先级

🔴 最高——核心功能断裂，其他优化建立在这个基础上
