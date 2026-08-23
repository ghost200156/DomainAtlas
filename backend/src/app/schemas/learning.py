"""Tutor, verify, and search request/response DTOs.

Note: the learner/plan models (``LearningBrief``, ``FrameworkModule``,
``FrameworkPlan``) were removed from here — their canonical definitions live in
``app.schemas.demo``. This file now holds only the tutor/verify/search payloads
used by the run API.
"""

from pydantic import BaseModel, Field

from app.schemas.agent_io import QuizQuestion


class TutorRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)


class VerifyRequest(BaseModel):
    explanation: str = Field(min_length=1, max_length=2_000)


class VerifyResponse(BaseModel):
    passed: bool
    feedback: str
    unlock_concept_ids: list[str] = Field(default_factory=list)


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    source: str  # "wikipedia", "arxiv", "github", "web"


class ExplainRequest(BaseModel):
    concept_id: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=2_000)


class QuizAnswerRequest(BaseModel):
    concept_id: str = Field(min_length=1)
    question_index: int = Field(ge=0)
    selected_index: int = Field(ge=0)
    correct: bool


class SaveNodeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    answer: str = Field(min_length=1, max_length=4_000)


class ChatMessage(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)


class ChatResult(BaseModel):
    reply: str
    summarize: bool = False
    node_name: str = ""
    node_definition: str = ""


class ReviewQuestionsRequest(BaseModel):
    concept_id: str = Field(min_length=1)


class SaveReviewRequest(BaseModel):
    concept_id: str = Field(min_length=1)
    concept_name: str = Field(min_length=1)
    questions: list[QuizQuestion]


class SaveChatNodeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    definition: str = Field(min_length=1, max_length=5_000)


class SuggestGoalsRequest(BaseModel):
    domain: str = Field(min_length=2, max_length=200)
