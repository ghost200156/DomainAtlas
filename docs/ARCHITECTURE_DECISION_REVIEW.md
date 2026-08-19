# 架构决策评审 Handoff

> 评审对象：`docs/ARCHITECTURE_DECISION.md`  
> 对照代码版本：`a7b38d4`  
> 评审日期：2026-08-19

> 实施状态更新（2026-08-19）：Phase 1 中的 evidence 注入、有效 `evidence_ids` 回传、
> 延迟/请求数 benchmark 已完成；同时修复了多来源 enrichment reload 前未保存的问题。
> Composition Root、DTO 提取、blocking grounding gate、原子 mutation 和 bounded ReAct
> 仍未实施。下文“当前行为”保留为评审当时的历史基线。

## 结论

现状诊断方向正确：DomainAtlas 的主流程是由 Python 显式编排、在固定阶段调用 LLM 的 Workflow，搜索策略无法根据证据质量和知识缺口动态调整。

但“让 ReAct Agent 取代整个 Workflow 控制器”的结论过度扩张了 Agent 的职责，会削弱生命周期控制、任务恢复、预算约束、确定性校验和发布安全。

推荐目标为：

> 保留确定性的外层任务工作流，在研究和 Atlas 生成阶段内部引入有预算、有停止条件的 ReAct 循环。

当前最直接的问题也不是“模型只拿到结构化 `ResearchPack`”。在实际生效的实现中，概念生成根本没有消费 `ResearchPack.evidence`，研究结果与生成内容实际上是脱钩的。

## 已核实的当前行为

### 工作流控制

`DemoOrchestrator` 显式维护以下任务状态：

```text
PREPARING_PLAN
→ WAITING_CONFIRMATION
→ GENERATING
→ READY | FAILED
```

它同时负责 checkpoint、fixture 降级、重试、校验、持久化和发布。因此主流程应被准确描述为“包含 LLM 阶段的确定性 Workflow”，而不是自治 Agent。

相关实现：

- `backend/src/app/workflow/orchestrator.py::prepare_plan`
- `backend/src/app/workflow/orchestrator.py::generate_atlas`
- `backend/src/app/workflow/orchestrator.py::finish_atlas`

### 搜索行为

当前搜索是预设策略，但并非字面意义上的“只搜索一次”：

- `build_research_candidates()` 为每个模块执行一次 Wikipedia 查询；
- `search_multi_source()` 为每个模块执行 arXiv 和 GitHub 查询；
- 查询构造、来源选择、失败处理和停止条件都由 Python 预先决定；
- 搜索失败时可能回退到 fixture 或未外部验证的模型知识。

因此应将问题表述为“搜索不可自适应”，而不是“只搜索一次”。

相关实现：

- `backend/src/app/workflow/research.py::build_research_candidates`
- `backend/src/app/workflow/research.py::search_multi_source`

### Grounding 缺陷

当前 Orchestrator 实际导入的是 `app.workflow.agents_per_module.LiveAgentPipeline`，而不是 `agents.py` 中的另一套实现。

虽然 `DemoOrchestrator` 将 `research_pack` 传给了 `build_atlas()`，但实际生效的方法：

1. 调用 `_build_concepts()` 时只传入 brief 和模块元数据；
2. 概念生成 prompt 不包含模块 evidence、excerpt、来源等级或 gaps；
3. 生成的概念使用空的 `evidence_ids`；
4. 最终只把 `research_pack.sources` 和 `research_pack.gaps` 复制到 `AtlasDocument`。

结果是：Atlas 可以展示一组来源，但无法证明概念内容由这些来源支撑。

相关实现：

- `backend/src/app/workflow/orchestrator.py` 中的 pipeline import 和 `build_atlas()` 调用；
- `backend/src/app/workflow/agents_per_module.py::_build_concepts`；
- `backend/src/app/workflow/agents_per_module.py::build_atlas`。

## 对原决策文档的修正

### 1. 修正核心信息流描述

建议将“Atlas 模型只看到结构化摘要”替换为：

> 当前生效的 Atlas 生成路径没有把 `ResearchPack.evidence` 注入概念生成，也没有要求 `ConceptNode` 引用 evidence ID，导致搜索结果与知识生成脱钩。

`ResearchPack` 本身并不是错误边界。它已经包含来源元数据、信任等级、证据陈述、excerpt、置信度和 gaps。相较于把完整网页塞进无限增长的上下文，结构化证据包更适合作为稳定接口。

### 2. 不把基础设施错误处理交给模型

Agent 可以在结果质量不足时决定改写查询或补充证据，但 Python 仍必须控制：

- tool-call 次数和迭代上限；
- 时间、token 和费用预算；
- timeout 和 provider retry；
- 来源及 URL 策略；
- 幂等、取消和恢复；
- schema、引用和图结构校验；
- 用户确认边界；
- 最终发布条件。

模型重试属于内容策略，不等于基础设施错误处理。

### 3. 保留外层协调器

`DemoOrchestrator` 不会因为引入 ReAct 自然消失。它应被拆分并重新定义职责：

- `RunCoordinator`：生命周期和状态转换；
- `AgentRunner`：有边界的模型与工具循环；
- `AtlasAssembler`：确定性的领域组装；
- `AtlasValidator`：发布前硬性校验；
- `RunRepository`：原子持久化和事件追加。

现有 `ADR-0001` 明确规定业务状态不能只存在于 Agent 对话中。新决策必须保留这一约束，或者正式声明 supersede 该 ADR，并记录任务恢复、预算和发布安全上的后果。

### 4. 将 DI 调整为 Composition Root

仅把 `runs.py` 中的模块级对象搬到 `dependencies.py`，并不能真正解决所有权问题。目标应是建立应用级 Composition Root：

- 在 FastAPI lifespan 中创建应用级 `DemoStore`、`TaskRegistry`、`SkillRegistry` 和 coordinator；
- 通过轻量 `Depends()` accessor 提供给路由；
- 支持路由测试中的 dependency override；
- 避免意外创建 request-scoped store 或 task registry。

问题不在于存在应用级单例，而在于它们当前由路由模块负责构造和持有。

### 5. 修正 Pydantic 问题名称

`_build_concepts()` 的问题不是“Pydantic Schema 内嵌方法体”，而是“在方法体内声明 Pydantic Schema”。这些 DTO 应移动到稳定模块，以便复用、测试和版本管理。ReAct 工具定义不会自动解决这个问题。

### 6. 将 API 和前端兼容定义为条件约束

REST 资源形状可以保持不变，但当前前端硬编码了以下进度阶段：

```text
researching
building_structure
validating
reviewing
publishing
```

若要求前端完全不变，后端必须把动态 Agent 行为投影到这些稳定的粗粒度阶段。内部工具活动可以增加新的事件类型，但不应破坏现有 `current_step` 语义。

不要持久化或通过 SSE 输出原始模型思维过程。应输出语义事件，例如：

- `tool_started`
- `tool_completed`
- `evidence_gap_detected`
- `module_drafted`
- `validation_failed`
- `atlas_ready`

## 推荐目标架构

```text
FastAPI API
  │
  ▼
RunCoordinator
  ├── prepare plan
  ├── wait for user confirmation
  ├── enforce budget, timeout, and cancellation
  │
  ├── Bounded Research and Build Agent
  │     ├── search_sources
  │     ├── evaluate_evidence
  │     ├── draft_module
  │     ├── request_more_evidence
  │     └── submit_module
  │
  ├── AtlasAssembler
  ├── AtlasValidator
  └── publish or fail
        │
        ▼
RunRepository + semantic event stream
```

Agent 控制局部内容决策，但不成为业务状态的权威所有者。

## 工具边界建议

不建议让 `create_concept`、`link_concepts` 这类细粒度 mutation tool 直接写入 `DemoStore`。这种设计会带来长循环、半成品状态、较高 token 成本和困难的恢复语义。

优先采用模块级结构化工具：

```text
search_sources(query, module_id, source_types)
evaluate_evidence(module_id, evidence)
draft_module(module_spec, evidence)
validate_module(module_draft)
submit_module(module_draft)
```

工具应向 runner 返回结构化值，由 runner 或 repository 层负责持久化和原子事件写入。

## 持久化风险

`DemoStore` 当前只锁住单次文件替换，没有覆盖完整的 read-modify-write 事务。多个 Agent 步骤或后台任务可能相互覆盖状态。

在允许工具写入中间状态前，应至少引入一种机制：

- 基于每个 run lock 的原子 `mutate(run_id, callback)`；
- 带 run version 的乐观并发控制；
- 数据库事务边界。

当前使用 `len(run.events) + 1` 生成事件 ID，也存在同类并发风险。

`TaskRegistry` 只保存当前 FastAPI 进程内的任务。ReAct 运行时间越长，进程重启造成的影响越大。生产化阶段需要可 checkpoint 的 Agent 状态以及可恢复的 worker 或任务队列。

## 推荐迁移顺序

### Phase 1：建立接缝和质量基线

1. 建立应用级 Composition Root 和依赖 accessor。
2. 将 `_build_concepts()` 中的嵌套 Pydantic DTO 移出方法体。
3. 将模块对应的 evidence 和 excerpt 注入概念生成。
4. 要求 grounded concept 提供有效 `evidence_ids`。
5. 将 grounding 和发布校验从 warning 改为 blocking gate。
6. 记录质量、延迟、token 使用量和失败率基线。

### Phase 2：抽取确定性服务

1. 把搜索 provider 抽象为 typed interface。
2. 将 Atlas 组装与模型调用分离。
3. 增加原子 repository mutation 和 semantic event append。
4. 定义明确的 Agent budget 和停止条件。

### Phase 3：试点有边界的 ReAct

1. 通过 feature flag，每次只在一个模块中启用 ReAct。
2. 允许 Agent 评估 evidence 并改写查询。
3. 限制迭代次数、运行时间、来源数量和模型消耗。
4. 每个 module draft 必须先通过校验再接纳。
5. 与固定 Workflow 基线进行对照。

### Phase 4：依据指标扩展

只有在以下指标得到实质改善时才扩大 Agent 自主范围：

- 概念事实准确性；
- evidence 覆盖和引用有效性；
- framework 覆盖度；
- 有价值的知识缺口识别；
- 用户感知的学习质量。

如果收益无法覆盖延迟、成本、方差和恢复复杂度，则不应继续扩大。

## 验收标准

迁移完成至少应满足：

- 每个非 synthetic concept 都引用有效 evidence，或被明确标记为 uncertain；
- 低质量或不足的 evidence 可以触发有边界的补充搜索；
- 用户确认仍是不可绕过的状态边界；
- 模型与工具循环无法超过配置预算；
- 发布不能绕过确定性校验；
- 中断任务具有明确的 retry 或 recovery 语义；
- 并发事件和状态更新不会丢数据；
- 现有 REST contract 保持兼容；
- 前端通过稳定粗粒度阶段获得一致进度；
- 测试覆盖成功、证据不足、工具失败、预算耗尽、校验拒绝、重试和取消。

## 建议落地的最终决策

> DomainAtlas 保留对任务生命周期、持久化、校验和发布的确定性控制。在用户确认的计划和强制资源限制内，允许有边界的 ReAct Agent 控制自适应研究与模块草拟。

该方案能够解决当前 grounding 和适应性问题，同时避免把模型对话状态变成产品工作流的唯一事实来源。
