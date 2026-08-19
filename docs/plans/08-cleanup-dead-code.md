# Plan 08 — 清理死代码：确认 agents.py 的实际使用范围

> 状态：**未开始**。截至 2026-08-19，仓库内部调用使用
> `agents_per_module.LiveAgentPipeline`；`agents.py` 中的旧 `LiveAgentPipeline` 未发现调用方，
> 但其中四个 prompt 常量仍被当前 pipeline import。建议与 Plan 06 一起完成 schema/prompt 边界整理。

## 问题

`agents.py` 有 349 行，包含旧的 agent 函数定义和 prompt 常量。
`agents_per_module.py` 只从它 import 了 4 个 prompt 常量：

```python
from app.workflow.agents import (
    PLANNING_PROMPT, RESEARCH_PROMPT, REVIEWER_PROMPT, REVIEW_PATH_PROMPT,
)
```

`agents.py` 里其余函数（如果有）是否还有调用方未经核实。

## 目标

- 确认 `agents.py` 哪些内容被实际使用
- 删除无调用方的函数和类
- 把仍在用的 prompt 常量迁移到合适的位置或保留原地

## 实现步骤

### 1. 检查实际 import 情况

```bash
grep -rn "from app.workflow.agents import" backend/
grep -rn "import agents" backend/
```

### 2. 对每个 `agents.py` 里的符号，确认有无调用方

```bash
grep -rn "PLANNING_PROMPT\|RESEARCH_PROMPT\|REVIEWER_PROMPT\|REVIEW_PATH_PROMPT" backend/
```

### 3. 删除没有调用方的代码

逐个确认后删除，保留 prompt 常量（仍在使用）。

### 4. 如果 agents.py 最终只剩 prompt 常量

考虑重命名为 `prompts.py`，语义更准确。

## 验收标准

- `agents.py`（或 `prompts.py`）里没有死代码
- `npm test` / `pytest` 通过
- 删除前每个符号都经过 grep 确认

## 优先级

🟢 低——收尾工作，不影响功能
