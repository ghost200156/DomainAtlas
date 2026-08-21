# Plan 09 — 拆分 atlas.tsx（1141 行）成多个组件

> 状态：**未开始**。这是独立前端重构，不与后端 Plan 03–08 混入同一 PR。

## 问题

`frontend/app/routes/atlas.tsx` 有 1141 行，是项目最大的单文件。
所有 Atlas 相关功能（地图渲染、节点交互、迷雾、搜索、概念详情、进度标记）都混在一个组件里，难以阅读和修改。

## 目标

- 按功能拆分成独立组件，每个文件 < 200 行
- 主文件 `atlas.tsx` 只负责组合和数据传递

## 拆分方向

需要先阅读 `atlas.tsx` 确认实际结构，以下为基于 1141 行体量的预估：

| 新组件 | 职责 | 预计行数 |
|--------|------|---------|
| `components/atlas/AtlasMap.tsx` | Canvas 地图渲染、节点布局、缩放平移 | ~300 |
| `components/atlas/ConceptDossier.tsx` | 概念详情面板、来源列表、自测题 | ~250 |
| `components/atlas/FogOverlay.tsx` | 迷雾效果、进度遮罩 | ~100 |
| `components/atlas/SearchPanel.tsx` | 概念搜索、过滤 | ~100 |
| `components/atlas/ProgressMarker.tsx` | 学习状态标记按钮 | ~80 |
| `routes/atlas.tsx`（主文件） | 数据获取、状态、组件组合 | ~150 |

## 实现步骤

1. 读完整 `atlas.tsx`，标记每个功能块的起止行
2. 确认组件边界（props 接口、共享状态）
3. 从最独立的组件开始提取（FogOverlay 或 SearchPanel）
4. 逐个提取，每次提取后确认页面功能正常
5. 最后精简主文件

## 注意事项

- 不改功能，只改结构
- 共享状态（当前选中概念、进度 map）留在主文件通过 props 传递
- CSS 类名不变，避免触发样式回归

## 优先级

🟢 低——纯前端重构，不影响后端，可独立进行
