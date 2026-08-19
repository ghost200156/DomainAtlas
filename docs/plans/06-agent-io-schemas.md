# Plan 06 — 提升内嵌 Pydantic Schema 到 schemas/agent_io.py

> 状态：**未开始**。下面的 schema 已同步 Plan 02 当前输出契约；实施时必须保持行为不变。

## 问题

`MiniConcept` 和 `ModuleConcepts` 定义在 `_build_concepts()` 方法体内：

```python
async def _build_concepts(self, ...):
    class MiniConcept(BaseModel):       # ← 局部类，外部不可见
        name: str = Field(...)
        ...
    class ModuleConcepts(BaseModel):
        concepts: list[MiniConcept]
```

这两个类是 AI 输出接缝——它们决定 LLM 必须返回什么结构。
局部定义导致：无法在测试里直接引用、Field 描述（prompt 的一部分）无法复用、字段改名靠肉眼搜索。

## 目标

- `MiniConcept` 和 `ModuleConcepts` 成为命名类型，在 `schemas/agent_io.py` 里
- 和 `PlanningOutput`、`ResearchPack` 同级，可独立 import 和测试

## 涉及文件

- 新建 `backend/src/app/schemas/agent_io.py`
- `backend/src/app/workflow/agents_per_module.py`

## 实现步骤

### 1. 新建 `schemas/agent_io.py`

```python
# backend/src/app/schemas/agent_io.py
from pydantic import BaseModel, Field


class MiniConcept(BaseModel):
    name: str = Field(description="教学主题名")
    definition: str = Field(
        description="## 概念(直接定义)→## 机制(原理与边界)。术语**加粗**。120-220字"
    )
    why_it_matters: str = Field(description="学会这个能做什么，一句话")
    key_points: list[str] = Field(
        description="恰好2条具体规则，每条不超过30字",
        min_length=2,
        max_length=2,
    )
    example: str = Field(
        description="2-3道简洁练习题；每题题干+【解】+答案，题间空行分隔，总长150-250字；匹配当前领域形式"
    )
    evidence_ids: list[str] = Field(
        default=[],
        description="本概念引用的 evidence ID 列表，从参考证据中选取"
    )


class ModuleConcepts(BaseModel):
    concepts: list[MiniConcept] = Field(min_length=2, max_length=3)
```

### 2. `agents_per_module.py` 改为 import

```python
from app.schemas.agent_io import MiniConcept, ModuleConcepts

async def _build_concepts(self, ...):
    # 删除局部 class 定义
    agent = Agent(self.model, output_type=ModuleConcepts, ...)
    ...
```

## 验收标准

- `agents_per_module.py` 里没有任何 `class` 定义
- `from app.schemas.agent_io import MiniConcept` 可以正常 import
- 行为与重构前完全一致

## 优先级

🟡 中——轻量改造，顺手可做
