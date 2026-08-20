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
        description="2-3道练习题；每题题干+【解】+答案，题间空行分隔；匹配当前领域形式"
    )
    evidence_ids: list[str] = Field(
        default=[],
        description="本概念引用的 evidence ID，从上方参考证据中选取，没有则留空",
    )


class ModuleConcepts(BaseModel):
    concepts: list[MiniConcept] = Field(min_length=2, max_length=3)
