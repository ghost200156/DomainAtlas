# 项目文档与进度管控

DomainAtlas 处于早期阶段，不需要一开始就建立复杂流程。推荐使用以下轻量组合。

## 当前建议保留的文档

| 文档 | 回答的问题 | 更新时机 |
|---|---|---|
| `README.md` | 项目是什么，怎么运行 | 上手方式变化时 |
| `docs/PRODUCT.md` | 为什么做，做什么，不做什么 | 产品边界变化时 |
| `docs/ROADMAP.md` | 接下来按什么阶段实现 | 里程碑变化时 |
| `docs/STATUS.md` | 当前做到哪里，正在做什么 | 每周或阶段变化时 |
| `docs/ARCHITECTURE.md` | 系统现在和未来怎样组成 | 架构整体变化时 |
| `docs/adr/*.md` | 为什么做出某个长期技术决策 | 决策被接受时 |
| `CHANGELOG.md` | 用户可感知的变化 | 合并功能或发布时；当前已建立 |

## 不要把所有内容都放进文档

具体开发任务、Bug 和验收细节更适合放在 GitHub Issues 中；跨 Issue 的阶段目标放 GitHub Milestones 或 Project 看板。

推荐关系：

```text
ROADMAP milestone
└── GitHub Milestone / Project
    ├── Feature Issue
    ├── Bug Issue
    ├── Technical Task
    └── Spike / Investigation
```

文档描述稳定认知，Issue 管理可执行工作。

## ADR：记录已经做出的决策

ADR 适合记录具有长期影响、未来可能被质疑的决定，例如：

- 为什么使用显式工作流，而不是自治 Agent；
- 为什么发布版本不可变；
- 为什么选择 PostgreSQL；
- 为什么采用某种任务队列；
- 为什么选择某个流式协议。

ADR 不用记录普通代码实现细节。每份 ADR 应说明背景、决定、结果和替代方案。

## RFC：只在复杂变更出现时引入

当前不必立即建立 RFC 流程。当一个提案满足以下任一条件时，再新增 `docs/rfcs/`：

- 横跨多个模块；
- 会改变外部 API 或数据模型；
- 需要比较多个方案；
- 实施成本较高且难以回滚；
- 需要在编码前获得讨论结论。

RFC 是“提议”，ADR 是“决定”。RFC 被接受后，可以产生一份 ADR。

## 建议后续按需增加的文档

### `CONTRIBUTING.md`

当项目开始接收其他贡献者时添加，说明开发环境、分支、提交、测试和 PR 要求。

### `SECURITY.md`

当仓库公开或准备部署时添加，说明漏洞报告方式、支持版本和敏感信息处理。

### `RELEASE.md` 或发布检查清单

开始正式版本发布后添加，包含迁移、测试、回滚、监控和发布步骤。

### `docs/OPERATIONS.md`

开始部署后台任务、数据库和监控后添加，记录运行、恢复、告警和故障处理。

### `docs/DATA_MODEL.md`

当 Atlas schema 和数据库实体增多时添加，避免把大量字段定义塞进架构概览。

## 推荐节奏

- 每周：更新 `STATUS.md`；
- 每个里程碑开始或结束：更新 `ROADMAP.md`；
- 每个长期架构决定：新增 ADR；
- 每个用户可感知变化：更新 `CHANGELOG.md`；
- 每次发布：关闭对应 Milestone，并检查文档是否过期。

## 最小原则

- README 保持短；
- Roadmap 管阶段，不管具体任务；
- Status 只描述现在；
- Issue 必须可执行、可验收；
- ADR 记录“为什么”，代码记录“怎么做”；
- 过期文档比缺少文档更危险。
