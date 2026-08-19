# 架构方向决策：从 Workflow 迁移到 ReAct Agent

> 本文记录 2026-08-19 架构审查讨论的过程与结论，供后续重构参考。

> 实施状态更新（2026-08-19）：本文的“现状诊断”基于 Plan 01/02 之前的代码。
> 当前已完成 evidence grounding、多来源 enrichment 持久化、模块级并行、分级 token budget、
> 明确重试边界和通用领域 prompt。确定性外层 Workflow 仍然保留；后续架构方向以
> `ARCHITECTURE_DECISION_REVIEW.md` 的 bounded ReAct 评审结论为准。

## 现状诊断

### 项目现在实际上是什么

DomainAtlas 目前是一个**有 LLM 调用的固定流水线**，不是真正的 Agent 项目。

流程由 Python 硬编码控制：

```
POST /api/runs
  → orchestrator.prepare_plan()
      → pipeline.plan()          ← LLM 填 FrameworkPlan（一次调用）
      → status = WAITING_CONFIRMATION

用户确认 → orchestrator.generate_atlas()
      → build_research_candidates()   ← 搜索一次
      → search_multi_source()         ← 可选补充搜索（失败则跳过）
      → pipeline.build_atlas()        ← LLM 按模块逐个填 ConceptNode
      → status = READY
```

**LLM 的角色全程只有一个：把自然语言填进 Pydantic 结构。**

它不知道有工具可以用，不知道搜索结果质量如何，没有机会决定"要不要再搜一次"。

### 核心信息流缺陷

`build_atlas` 里的 LLM 拿到的是 `ResearchPack`——结构化摘要，不是真实搜索内容。它无法判断：

- 这条证据来自高质量来源还是垃圾词条
- 信息是否足够，需不需要补充搜索
- 建到一半发现知识缺口，能不能回头搜

当前架构假设"先研究再建图"永远是最优顺序。这个假设对 DomainAtlas 的核心价值（帮用户建立结构化认知）特别致命——研究质量差，生成的概念就是在胡说。

### 架构代码层面的问题（次要）

架构审查还发现四个代码层面的问题，按优先级排列：

| # | 问题 | 位置 | 在 ReAct 重构中的命运 |
|---|------|------|----------------------|
| 1 | 单例反模式，绕过 FastAPI DI | `runs.py` | **需要先修**，ReAct agent 同样需要可注入依赖 |
| 2 | Orchestrator God Object | `orchestrator.py` | 随重构消失，无需单独优化 |
| 3 | `build_atlas` 混合 LLM 调用与领域组装 | `agents_per_module.py` | 随重构消失 |
| 4 | Pydantic Schema 内嵌方法体 | `_build_concepts()` | ReAct 工具定义中自然规范化 |

---

## 决策

**直接重构到 ReAct Agent，不先优化现有 workflow 架构。**

理由：现有架构的根本缺陷是**信息流设计问题**，不是代码组织问题。优化 Orchestrator 是在打磨即将被删掉的东西。

唯一例外：**先做 #1（DI 接缝）**，因为 ReAct agent 同样需要可测试的依赖注入结构。

---

## ReAct 是什么

ReAct = **Re**asoning + **Act**ing，核心是一个由 LLM 驱动的循环：

```
while not done:
    thought = llm.think("我现在知道什么，下一步该做什么？")
    action  = llm.choose_tool(thought)
    result  = execute_tool(action)
    llm.observe(result)
```

**与当前架构的根本区别：**

| | 当前（Workflow） | 目标（ReAct） |
|--|-----------------|--------------|
| 流程控制者 | Python 代码（Orchestrator） | LLM 自身 |
| LLM 角色 | 在固定位置填结构化输出 | 决定下一步调哪个工具 |
| 搜索策略 | 搜一次，直接建图 | 搜→观察质量→决定继续搜或换词 |
| 错误处理 | try/except + fixture 降级 | LLM 观察结果后自行重试 |
| 信息流 | 断开（研究和建图是两次独立调用） | 连续（LLM 全程持有上下文） |

### 同一任务的执行对比

**现在：**
```
搜索("Agent系统设计") → ResearchPack → build_atlas(ResearchPack) → AtlasDocument
                         ↑                ↑
                    LLM 看不到           LLM 蒙眼工作
```

**ReAct：**
```
[思考] 先搜核心定义
[工具] search("Agent system design")
[观察] Wikipedia 返回太泛，质量差

[思考] 换更具体的关键词
[工具] search("LLM agent ReAct planning memory tool use")
[观察] 找到 ReAct 论文摘要，有用

[思考] 有了基础，开始建第一个概念
[工具] create_concept("ReAct", definition="...")
[观察] 成功，但定义里提到 tool use，还没覆盖

[思考] 需要补充 tool use 才能建完整关系图
[工具] search("LLM tool use function calling")
...
```

---

## 重构边界

### 保留（稳定基础）

- `DemoStore` + `DemoRun` 数据模型 — agent 同样需要持久化状态
- `schemas/demo.py` 里的核心数据结构（`AtlasDocument`、`ConceptNode`、`FrameworkPlan` 等）
- API 路由层（`/runs`、`/runs/{id}/events` 等接口不变）
- 前端 — 完全不动

### 替换

- `DemoOrchestrator` — 被 agent loop 替代
- `LiveAgentPipeline` — 各方法变成 agent 可调用的工具定义

### 自然浮现（重构中设计）

- 工具集（tool interface）：`search`、`create_concept`、`link_concepts`、`assemble_atlas` 等
- Agent 状态如何映射到 `DemoRun` 事件流（SSE）
- 工具执行结果如何写回 `DemoStore`

---

## 下一步

1. **DI 接缝**（先做）：把 `runs.py` 的四个单例迁移到 `dependencies.py`，用 `Depends()` 注入
2. **工具集设计**：定义 ReAct agent 的工具接口，从 `LiveAgentPipeline` 方法中提取
3. **Agent Loop**：选择框架（pydantic-ai tool use / LangGraph / 手写循环），接入现有 `DemoStore`
4. **事件流衔接**：agent 每次 think/act 产生一个 `RunEvent`，SSE 照常推送给前端
