# DomainAtlas 架构概览

## 架构原则

DomainAtlas 在产品层面表现为学习 Agent，但不会由单个自治 Agent 维护完整业务状态。

- 显式 Python 工作流负责阶段顺序、状态、预算、重试和发布；
- Agent 只执行有边界的规划、研究、构建和审查任务；
- 结构化产物是阶段之间的主要接口；
- 确定性程序负责 schema、引用和覆盖校验；
- 已发布的 `AtlasVersion` 不可变。

相关决策见：

- [ADR-0001：使用显式工作流控制学习阶段](adr/0001-explicit-workflow-control.md)
- [ADR-0002：使用统一知识模型生成 Atlas 视图](adr/0002-shared-atlas-knowledge-model.md)

## 当前架构

```text
React UI
   │ AI SDK messages
   ▼
POST /agent
   │
   ├── 请求与消息校验
   ├── AI SDK → Pydantic-AI 转换
   ├── Pydantic-AI Agent
   └── 工具执行
   │
   ▼
SSE / AI SDK Data Stream Protocol
```

当前实现只验证流式消息和工具调用，不包含正式的领域学习工作流。

## 目标架构

```text
Web Client
   │
   ▼
FastAPI Application
   │
   ├── Task API
   ├── Atlas API
   ├── Assessment API
   └── Streaming / Progress API
   │
   ▼
Explicit Workflow Engine
   │
   ├── Scope Calibration
   ├── Planning
   ├── Research
   ├── Atlas Building
   ├── Validation
   └── Review / Publish
   │
   ├──────────────┐
   ▼              ▼
LLM / Agents   Deterministic Validators
   │              │
   └──────┬───────┘
          ▼
PostgreSQL + Background Jobs
```

## 主要领域产物

| 产物 | 作用 | 生命周期 |
|---|---|---|
| `LearningBrief` | 学习目标、背景、成果和预算 | 任务创建后可修改 |
| `FrameworkPlan` | 模块、问题、重点和排除项 | 用户确认后锁定 |
| `ResearchPack` | 来源、证据、争议和缺口 | 构建期间可追加 |
| `AtlasDraft` | 待校验的知识模型 | 可修复和重新生成 |
| `QualityReport` | 程序校验与 Reviewer 结果 | 关联具体草稿 |
| `AtlasVersion` | 已发布 Atlas | 不可变 |
| `AssessmentResult` | 自测结果与薄弱点映射 | 关联用户和版本 |

## 状态与消息的边界

Agent 对话消息用于交互和解释，不作为业务状态的唯一来源。

业务状态应显式保存，例如：

```text
draft
→ awaiting_plan_confirmation
→ researching
→ building
→ reviewing
→ published
→ failed
```

工作流恢复时，应依赖已保存的状态和结构化产物，而不是要求模型从完整聊天记录中推断当前阶段。
