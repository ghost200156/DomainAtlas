# DomainAtlas 架构概览

本文档区分“当前第一版 Demo 架构”和“未来生产架构”。除非明确标注为目标设计，否则以下组件均已在当前仓库中实现。

## 架构原则

DomainAtlas 在产品层面表现为学习 Agent，但不让单个自治 Agent 维护完整业务状态。

- 显式 Python 工作流负责阶段顺序、状态、人工确认、回退和发布；
- Agent 只执行有边界的规划、研究整理和 Atlas 构建；
- Pydantic 结构化产物是阶段之间的接口；
- 确定性程序负责 schema、引用、覆盖度和图连通性校验；
- 前端只通过任务 API 读取和更新业务状态，不从聊天记录推断阶段。

相关决策：

- [ADR-0001：使用显式工作流控制学习阶段](adr/0001-explicit-workflow-control.md)
- [ADR-0002：使用统一知识模型生成 Atlas 视图](adr/0002-shared-atlas-knowledge-model.md)

## 当前第一版 Demo 架构

```text
React Router Client
   │
   │ REST + SSE progress
   ▼
FastAPI Application
   ├── Run / Plan API
   ├── Atlas / Progress API
   ├── Assessment API
   ├── Event Stream API
   └── retained POST /agent prototype
   │
   ▼
DemoOrchestrator ───────────────┐
   ├── Planning Agent          │
   ├── Research Agent          ├── Deterministic validators
   ├── Atlas Agent             │   and reference repair
   └── validate / publish ─────┘
   │
   ├── OpenAI-compatible model
   ├── controlled Wikipedia candidates
   └── fixture fallback
   │
   ▼
JSON Demo Store: backend/data/runs/*.json
```

前端页面：

```text
/
├── /new
├── /runs/:runId/plan
├── /runs/:runId/progress
└── /runs/:runId/atlas
```

## Agent 职责

当前只有三个模型阶段，不是六个自治 Agent。

| 阶段 | 输入 | 输出 | 不负责 |
|---|---|---|---|
| Planning | `LearningBrief` | `PlanningOutput`，包含范围校准和 `FrameworkPlan` | 外部研究、Atlas 内容 |
| Research | 已确认计划、受控候选资料 | `ResearchPack` | 自行新增 URL、改变计划 |
| Atlas | Brief、计划、研究包 | `AtlasDocument` | 绕过来源约束、发布未校验结果 |

校验、引用修复、任务状态和发布由普通 Python 代码负责。当前 `QualityReport` 主要来自确定性检查和演示评分，不存在独立 Reviewer Agent。

## 当前工作流

对外状态：

```text
PREPARING_PLAN
→ WAITING_CONFIRMATION
→ GENERATING
→ READY
└→ FAILED
```

主要内部步骤：

```text
calibrating
→ planning
→ waiting_confirmation
→ researching
→ building_structure
→ validating
→ reviewing
→ publishing
→ ready
```

关键约束：

- 用户未确认 `FrameworkPlan` 时不能进入研究；
- `auto` 模式下模型异常会使用 fixture 继续，并将任务标记为 `hybrid`；
- Atlas 必须满足模块数、概念数、引用有效性、关系覆盖和图连通性要求；
- 前端轮询任务状态，并通过 SSE 接收可观察事件；
- 学习进度按 concept ID 保存为 `unvisited`、`unclear` 或 `understood`。

## 当前结构化产物

| 产物 | 当前作用 | 当前存储方式 |
|---|---|---|
| `LearningBrief` | 学习主题、背景、目标、预算和边界 | `DemoRun` JSON |
| `PlanningOutput` | 范围校准与计划 | `DemoRun` JSON |
| `FrameworkPlan` | 模块、问题、顺序和完成标准 | `DemoRun` JSON |
| `ResearchPack` | 受控来源、证据和信息缺口 | `DemoRun` JSON |
| `AtlasDocument` | 模块、概念、关系、机制、案例、路径、自测和来源 | `DemoRun` JSON |
| `QualityReport` | 覆盖、结构、来源和学习质量结果 | `DemoRun` JSON |
| `AssessmentFeedback` | 得分、反馈和复习概念 | `DemoRun` JSON |

所有 Atlas 视图都从同一份 `AtlasDocument` 派生。地图的迷雾和节点解锁是前端学习状态的投影，不会复制或修改知识事实。

## 当前运行与数据边界

- `DemoStore` 将每个任务写入 `backend/data/runs/{run_id}.json`；
- `TaskRegistry` 使用当前 FastAPI 进程内的 `asyncio.Task`；
- 后端进程重启后，JSON 任务仍存在，但运行中的后台协程不会恢复；
- 当前没有数据库事务、跨进程锁、任务队列或用户权限；
- API Key 只从 `backend/.env` 读取，不进入前端和任务 JSON；
- 中文维基百科是当前唯一网络研究源，每个模块最多保留一条候选摘要。

## 未来生产架构

以下是后续方向，不属于第一版 Demo：

```text
Web Client
   │
   ▼
Authenticated FastAPI API
   │
   ├── Task / Atlas / Assessment APIs
   ├── budget and rate-limit policies
   └── progress stream
   │
   ▼
Recoverable Workflow + Job Queue
   ├── bounded Agent stages
   ├── deterministic validators
   └── independent review
   │
   ├───────────────┐
   ▼               ▼
PostgreSQL      Object / search storage
   │
   ▼
Immutable AtlasVersion + migrations + audit log
```

生产化需要补充：

- PostgreSQL、迁移、事务和备份；
- 可恢复、幂等的后台任务；
- 认证、所有权和权限；
- 模型调用预算、限流、日志和监控；
- 多来源研究、来源评级和独立审阅；
- 不可变 `AtlasVersion`、修订和回滚。
