from pydantic import BaseModel, Field


class LearningBrief(BaseModel):
    """The learner's goal and constraints for one bounded learning task."""

    topic: str = Field(min_length=1, max_length=500)
    learner_background: str = Field(min_length=1, max_length=2_000)
    learning_goal: str = Field(min_length=1, max_length=2_000)
    time_budget_minutes: int = Field(gt=0, le=10_080)
    desired_outcome: str = Field(min_length=1, max_length=2_000)


class FrameworkModule(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    purpose: str = Field(min_length=1, max_length=1_000)
    core_questions: list[str] = Field(min_length=1, max_length=20)
    priority: str = Field(min_length=1, max_length=40)


class FrameworkPlan(BaseModel):
    """A proposed, bounded map for the learner to confirm or revise."""

    scope: str = Field(min_length=1, max_length=2_000)
    modules: list[FrameworkModule] = Field(min_length=1, max_length=20)
    exclusions: list[str] = Field(default_factory=list, max_length=20)
    assumptions: list[str] = Field(default_factory=list, max_length=20)


# ── Tutor, Verify & Search ──


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

