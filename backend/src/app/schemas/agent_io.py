from pydantic import BaseModel, Field


class QuizQuestion(BaseModel):
    """A multiple-choice quiz item with an answer and explanation."""

    question: str = Field(description="题干，直接考查卡片已讲内容")
    options: list[str] = Field(
        description="2-4 个选项，长度尽量一致，不要用格式暗示答案",
        min_length=2,
        max_length=4,
    )
    correct_index: int = Field(description="正确选项的下标，从 0 开始")
    explanation: str = Field(description="判分后展示的解释：为什么对/错")


class ConceptSection(BaseModel):
    """The 'concept' subsection: intuition -> definition -> mechanism."""

    name: str = Field(description="小节名")
    definition: str = Field(
        description="用 markdown 结构，分「## 直觉」「## 定义」「## 机制」三小节，术语**加粗**，段间用空行分隔。300-500字"
    )
    why_it_matters: str = Field(description="学会这个能做什么，一句话")
    key_points: list[str] = Field(description="恰好2条具体规则", min_length=2, max_length=2)


class QuizList(BaseModel):
    """Multiple-choice questions for the 'quiz' subsection."""

    questions: list[QuizQuestion] = Field(min_length=2, max_length=3)


class ExpandOptions(BaseModel):
    """Selectable「哪里不理解」options for the expand-node flow."""

    options: list[str] = Field(
        description="3-4 个学习者关于这个概念最可能不理解的点，每个一句，具体、贴住概念，不引用图片/示意图",
        min_length=3,
        max_length=4,
    )


class LessonContent(BaseModel):
    """One complete lesson node, split into ordered sections so the frontend can
    render 为什么从这里开始 → 直觉 → 定义 → 机制 → 走读 → 小测 → 动手 → 读物."""

    name: str = Field(description="概念名")
    definition: str = Field(
        description="用 markdown 分「## 为什么从这里开始」「## 直觉」「## 定义」「## 机制」「## 走读」五节，术语**加粗**，可用表格/代码"
    )
    quiz: list[QuizQuestion] = Field(description="2-3道选择题，答案能从 definition 内容推导", min_length=2, max_length=3)
    hands_on: str = Field(description="「动手」：可执行步骤 + 预期结果，含一个可点击的工具/模拟器链接 [工具名](https://完整URL)")
    reading: str = Field(description="「读物」：1-2 条可点击链接 [资源名](https://完整URL)，真实存在的官方/文档 URL")
    key_points: list[str] = Field(description="2-3条具体规则", min_length=2, max_length=3)
