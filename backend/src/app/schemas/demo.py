from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class RunStatus(StrEnum):
    PREPARING_PLAN = "PREPARING_PLAN"
    WAITING_CONFIRMATION = "WAITING_CONFIRMATION"
    GENERATING = "GENERATING"
    READY = "READY"
    FAILED = "FAILED"


class LearningBrief(BaseModel):
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
    confirmed_scope: str | None = Field(default=None, max_length=1_000)


class BriefCalibration(BaseModel):
    interpretation: str
    scope_assessment: Literal["suitable", "too_broad", "too_narrow", "ambiguous"]
    rationale: str
    suggested_scope: str
    questions: list[str] = Field(default_factory=list, max_length=3)
    warnings: list[str] = Field(default_factory=list)
    can_generate_plan: bool


class FrameworkModule(BaseModel):
    id: str
    title: str
    purpose: str
    priority: Literal["core", "important", "optional"]
    core_questions: list[str] = Field(min_length=1, max_length=5)


class FrameworkPlan(BaseModel):
    goal_summary: str
    domain_definition: str
    scope: str
    exclusions: list[str] = Field(default_factory=list)
    modules: list[FrameworkModule] = Field(min_length=3, max_length=7)
    evidence_requirements: list[str] = Field(default_factory=list)
    learning_sequence: list[str] = Field(min_length=1)
    estimated_concepts: int = Field(ge=6, le=40)
    estimated_minutes: int = Field(ge=30, le=1_440)
    completion_criteria: list[str] = Field(min_length=1)


class PlanningOutput(BaseModel):
    calibration: BriefCalibration
    plan: FrameworkPlan


class Source(BaseModel):
    id: str
    title: str
    url: str
    publisher: str | None = None
    trust_tier: Literal["A", "B", "C"]


class EvidenceItem(BaseModel):
    id: str
    source_id: str
    module_id: str
    statement: str
    excerpt: str
    evidence_type: Literal["fact", "definition", "case", "viewpoint", "dispute"]
    confidence: Literal["high", "medium", "low"]


class ResearchPack(BaseModel):
    sources: list[Source]
    evidence: list[EvidenceItem]
    gaps: list[str] = Field(default_factory=list)


class AtlasOverview(BaseModel):
    definition: str
    boundary: str
    essential_question: str
    key_takeaways: list[str] = Field(default_factory=list, max_length=5)


class AtlasModule(BaseModel):
    id: str
    title: str
    summary: str
    color: str


class ConceptNode(BaseModel):
    id: str
    module_id: str
    name: str
    definition: str
    why_it_matters: str
    key_points: list[str] = Field(default_factory=list, max_length=5)
    example: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    misconception: str | None = None
    uncertainty: str | None = None


class ConceptRelation(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: Literal["enables", "constrains", "informs", "evaluates", "depends_on"]
    explanation: str


class Mechanism(BaseModel):
    id: str
    title: str
    explanation: str
    steps: list[str] = Field(default_factory=list, max_length=6)
    concept_ids: list[str]


class CaseStudy(BaseModel):
    id: str
    title: str
    summary: str
    context: str | None = None
    lesson: str | None = None
    concept_ids: list[str]


class LearningStage(BaseModel):
    id: str
    title: str
    objective: str
    concept_ids: list[str]
    estimated_minutes: int
    checkpoint: str | None = None


class Assessment(BaseModel):
    id: str
    prompt: str
    options: list[str]
    expected_answer: str
    related_concept_ids: list[str]


class AtlasDocument(BaseModel):
    title: str
    overview: AtlasOverview
    modules: list[AtlasModule]
    concepts: list[ConceptNode]
    relations: list[ConceptRelation]
    mechanisms: list[Mechanism]
    cases: list[CaseStudy]
    learning_path: list[LearningStage]
    assessments: list[Assessment]
    sources: list[Source]
    gaps: list[str] = Field(default_factory=list)


class QualityIssue(BaseModel):
    severity: Literal["critical", "major", "minor"]
    target_id: str
    problem: str
    suggested_fix: str


class QualityReport(BaseModel):
    scope_coverage: float = Field(ge=0, le=1)
    structure_quality: float = Field(ge=0, le=1)
    grounding_quality: float = Field(ge=0, le=1)
    learning_quality: float = Field(ge=0, le=1)
    issues: list[QualityIssue] = Field(default_factory=list)
    publishable: bool


class RunEvent(BaseModel):
    id: int
    type: str
    step: str
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AssessmentFeedback(BaseModel):
    assessment_id: str
    score: float = Field(ge=0, le=1)
    feedback: str
    review_concept_ids: list[str] = Field(default_factory=list)


class DemoError(BaseModel):
    code: str
    message: str
    failed_step: str
    retryable: bool = True


class DemoRun(BaseModel):
    id: str
    status: RunStatus
    current_step: str | None = None
    brief: LearningBrief
    calibration: BriefCalibration | None = None
    plan: FrameworkPlan | None = None
    research_pack: ResearchPack | None = None
    atlas: AtlasDocument | None = None
    quality_report: QualityReport | None = None
    execution_mode: Literal["live", "hybrid", "fixture"] = "live"
    model_name: str | None = None
    fallback_notes: list[str] = Field(default_factory=list)
    events: list[RunEvent] = Field(default_factory=list)
    progress: dict[str, Literal["unvisited", "unclear", "understood"]] = Field(default_factory=dict)
    assessment_results: list[AssessmentFeedback] = Field(default_factory=list)
    error: DemoError | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ConfirmPlanRequest(BaseModel):
    plan: FrameworkPlan | None = None


class ProgressUpdateRequest(BaseModel):
    state: Literal["unvisited", "unclear", "understood"]


class AssessmentAttemptRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=2_000)
