# ADR-0003：引入有界 Agent 控制器与确定性治理层

- 状态：已接受
- 日期：2026-08-21
- 修订：ADR-0001（部分修订）；扩展 `docs/ARCHITECTURE_DECISION_REVIEW.md`

## 背景

- ADR-0001 决定用显式 Python 工作流维护状态，agent 只做有界阶段。第一版 Demo 已证明这在**生成侧**是可靠的。
- 但当前产物一旦 `READY` 就结束：学习侧是「无状态问答 + 终点式自测」，没有 agent 根据学习者掌握情况决定下一步，也没有能力在边界处扩展地图。
- 产品目标是「会教的领域学习 agent」（真实产品方向），需要三样：贯穿全生命周期的决策循环、随时间累积的学习者模型、持久化/可恢复/可审计的执行。
- 完全自治的单一 agent 已被 ADR-0001 否决且不可靠；但「只有固定流水线、没有循环」又无法满足教学闭环。

## 与既有架构决策的关系

- `docs/ARCHITECTURE_DECISION_REVIEW.md`（2026-08-19）已确立「保留确定性外层工作流，在研究与建图阶段引入有预算、有停止条件的 ReAct 循环」。本 ADR **延续而非推翻**该决策。
- 本 ADR 做两件事：① 把「有界动作 + 确定性治理」正式化为贯穿全生命周期的两层结构（生成侧 + 学习侧）；② 补上团队尚未覆盖的**学习侧教学循环**（`LearnerModel`、ZPD、检索练习、间隔复习）。
- 团队决策中生成侧的有界工具集（`search_sources` / `draft_module` 等）是本 ADR 动作空间在生成侧的子集，仍然有效，不重复设计。
- ADR-0001 要求「业务状态不交给自治 agent」；团队评审已指出需正式声明 supersede 或保留。本 ADR 正式完成这一修订：**保留约束，扩展为有界动作循环**。

## 决策

### 1. 两层结构

- **Study Controller（有界决策器）**：模型驱动。每个决策步观察当前状态，从**有界动作空间**中提议一个动作。它拥有「决定权」。
- **确定性治理层（Governance）**：Python 代码。持有并持久化所有业务状态（FSM、`MissionDoc`、`LearnerModel`、预算、审计日志），校验 controller 的提议是否合法，然后执行并提交。它拥有「状态权和执行权」。

Controller **从不直接写状态**——只产生「意图」（一个动作 + 参数 + 理由），治理层校验后提交。这是本 ADR 与「自治 agent」的根本分界。

### 2. 有界动作空间（覆盖全生命周期）

Controller 每一步只能输出下列动作之一：

**生成侧**

| 动作 | 含义 |
|---|---|
| `calibrate_scope` | 校准范围与目标 |
| `propose_plan` | 提出 `FrameworkPlan` |
| `research` | 就当前计划收集证据 |
| `build_atlas` | 构建 `AtlasDocument` |
| `review_atlas` | 触发质量审查 |
| `publish` | 发布一个新 `AtlasVersion` |
| `expand_research` | 针对薄弱/边界模块补充研究 |
| `expand_map` | 在现有 Atlas 上扩展新模块/概念 |

**学习侧**

| 动作 | 含义 |
|---|---|
| `introduce_concept` | 一次只教一个概念（由 ZPD 选中） |
| `run_practice` | 针对某概念出检索练习 |
| `assess` | 评估理解，更新掌握度 |
| `schedule_review` | 把某概念加入间隔复习队列 |
| `mark_complete` | 提议完成标准已达成（治理层用硬指标校验） |

**终止**：`finish`

每个动作产出结构 `{action, target_id?, params?, rationale}`，`rationale` 供审计与前端展示「它为什么这么决定」。

### 3. 持久化核心对象

- **`MissionDoc`**：目标、背景、时间预算、完成标准。取代现在「生成完就扔」的 `LearningBrief`，成为 controller 每一步的输入。
- **`LearnerModel`**（完整版）：每概念 `mastery`（0–1）、`state`（未学 / 已介绍 / 练习中 / 已掌握 / 薄弱）、`misconceptions`（误区）、`records`（学习记录）、`last_reviewed_at`、`review_due`（间隔调度）。

### 4. 关键不变量（治理层硬保证）

1. **Controller 不直接写状态**：只产生意图，治理层校验后提交。
2. **状态可重放**：从审计日志能还原「每一步为什么发生」。
3. **预算硬上限**：任何动作不得超出剩余 token / 动作数。
4. **一次只教一个概念**：`introduce_concept` 粒度 = 单概念，不再一次吐 24 个。
5. **地图扩展必须产生新 `AtlasVersion`**（不可变，接 ADR-0002）。
6. **完成标准由硬指标判定**：`mark_complete` 是 controller 的**提议**，治理层用「掌握度阈值 + 预算耗尽」校验，不由模型单独决定。

## 对 ADR-0001 的修订

- **保留**：确定性代码拥有状态；校验/发布是硬条件；agent 只做有界工作。
- **变更**：把「固定阶段顺序的流水线」扩展为「治理层约束下的动作循环」。阶段顺序不再硬编码为唯一路径，而是 FSM 允许的合法转移集合；controller 在其中选择。
- **明确**：controller 的「全生命周期决策权」**始终在治理层约束内行使**，不构成 ADR-0001 否决的「自治 agent 持有状态」。

## 与 ADR-0002 的关系

`expand_map` / `expand_research` 产生的修改走「草稿 → 校验 → 发布新 `AtlasVersion`」路径；所有视图仍从统一知识模型派生，不做事实副本。

## 影响（后果）

- **可靠性**来自治理层，而非对模型的信任。
- **新增维护面**：动作空间 schema、FSM 合法转移表、预算/限流、审计日志、间隔调度器。
- **测试策略**：治理层用确定性测试；controller 用「给定状态 → 期望动作」的黄金用例。
- **复杂度上升**：进程内 `asyncio.Task` 不足以支撑真实产品，需可恢复作业 / 持久任务模型（SQLite/Postgres + 队列）。
- **前端**：`TutorPanel` 升级为「教学会话」，展示 controller 的 `rationale` 与 `LearnerModel` 变化。

## 当前实现备注

本文档为 P0 设计产物，落地尚未开始。`schemas/learner.py` 已定义 `MissionDoc` 与 `LearnerModel`；`skills/domainatlas/teaching/SKILL.md` 已定义教学动作的提示词守则。生成侧迁移沿用团队 `docs/plans/01..09`；学习侧闭环由后续计划承接。
