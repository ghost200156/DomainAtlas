"""Learner model and mission doc.

These are the durable learning-side objects the Study Controller reads at every
decision step, and the deterministic governance layer owns and persists. They
extend the run's three-state ``progress`` field into a full mastery model with
learning records, misconceptions, and spaced-review scheduling.

See: docs/adr/0003-bounded-agent-controller.md
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class MissionDoc(BaseModel):
    """The learner's durable goal and constraints.

    Supersedes ``LearningBrief`` as the mission the controller reads at every
    step: ``LearningBrief`` is the creation-time input; ``MissionDoc`` is the
    canonical mission that persists and drives teaching after generation.
    """

    domain: str = Field(min_length=2, max_length=200)
    primary_intent: Literal[
        "interest_exploration",
        "task_driven",
        "cross_domain_connection",
        "decision_preparation",
    ]
    learner_background: str = Field(min_length=2, max_length=1_000)
    desired_outcome: str = Field(min_length=2, max_length=1_000)
    learning_time_minutes: int = Field(ge=30, le=1_440)
    focus_items: list[str] = Field(default_factory=list, max_length=8)
    exclusions: list[str] = Field(default_factory=list, max_length=8)
    completion_criteria: list[str] = Field(default_factory=list)


class ConceptState(StrEnum):
    """Mastery state for a single concept.

    Refines the old three-state ``progress`` dict
    (``unvisited`` / ``unclear`` / ``understood``) into a lifecycle:
    unvisited -> introduced -> practicing -> understood (or -> weak).
    """

    UNVISITED = "unvisited"      # not yet introduced
    INTRODUCED = "introduced"    # taught once, not yet practiced
    PRACTICING = "practicing"    # retrieval practice attempted
    UNDERSTOOD = "understood"    # assessed and passed
    WEAK = "weak"                # assessed failed, or misconception flagged


class LearningRecord(BaseModel):
    """A non-obvious insight, misconception, or open question the learner hit.

    Mirrors the ``teach`` skill's learning-records: it captures what is now
    known (or misunderstood), not mere exposure, so future steps can build on it.
    """

    id: str
    concept_id: str
    kind: Literal["insight", "misconception", "question"]
    note: str = Field(min_length=1, max_length=2_000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ConceptMastery(BaseModel):
    """Per-concept mastery: the atom of the learner model."""

    concept_id: str
    state: ConceptState = ConceptState.UNVISITED
    mastery: float = Field(default=0.0, ge=0, le=1)
    attempt_count: int = Field(default=0, ge=0)
    last_reviewed_at: datetime | None = None
    review_due: bool = False
    records: list[LearningRecord] = Field(default_factory=list)


class LearnerModel(BaseModel):
    """The learner model the controller reads and the governance layer owns.

    Keyed by concept id. The governance layer persists this on the run and
    mutates it only after validating the controller's proposed action.
    """

    concepts: dict[str, ConceptMastery] = Field(default_factory=dict)
    steps_taken: int = Field(default=0, ge=0)
    pending_practice_concept_id: str | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
