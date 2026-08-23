"""Teaching-loop decision and step-result DTOs (ADR-0003).

The Study Controller proposes a bounded action; the governance layer validates
it before execution. These schemas are the interface between the two.
"""

from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.learner import LearnerModel


class TeachAction(StrEnum):
    """The bounded action space of the teaching loop (learning side only)."""

    INTRODUCE_CONCEPT = "introduce_concept"
    RUN_PRACTICE = "run_practice"
    ASSESS = "assess"
    SCHEDULE_REVIEW = "schedule_review"
    MARK_COMPLETE = "mark_complete"


class TeachDecision(BaseModel):
    """The controller's bounded proposal. Governance validates before execution."""

    action: TeachAction
    target_concept_id: str | None = None
    rationale: str = Field(default="")


class TeachAnswerRequest(BaseModel):
    """Optional answer carried into a teaching step (feeds a pending practice)."""

    answer: str | None = Field(default=None, max_length=2_000)


class TeachStepResult(BaseModel):
    """What one teaching step produced, returned to the frontend."""

    action: TeachAction
    target_concept_id: str | None = None
    rationale: str = ""
    message: str = ""
    question: str | None = None
    learner_model: LearnerModel | None = None
    done: bool = False
    budget_remaining: int = 0
