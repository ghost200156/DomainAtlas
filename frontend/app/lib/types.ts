export type RunStatus =
  | "PREPARING_PLAN"
  | "WAITING_CONFIRMATION"
  | "GENERATING"
  | "READY"
  | "FAILED";

export type LearningBrief = {
  domain: string;
  primary_intent:
    | "interest_exploration"
    | "task_driven"
    | "cross_domain_connection"
    | "decision_preparation";
  learner_background: string;
  desired_outcome: string;
  learning_time_minutes: number;
  focus_items: string[];
  exclusions: string[];
};

export type FrameworkModule = {
  id: string;
  title: string;
  purpose: string;
  priority: "core" | "important" | "optional";
  core_questions: string[];
};

export type FrameworkPlan = {
  goal_summary: string;
  domain_definition: string;
  scope: string;
  exclusions: string[];
  modules: FrameworkModule[];
  evidence_requirements: string[];
  learning_sequence: string[];
  estimated_concepts: number;
  estimated_minutes: number;
  completion_criteria: string[];
};

export type RunEvent = {
  id: number;
  type: string;
  step: string;
  message: string;
  created_at: string;
};

export type AtlasModule = {
  id: string;
  title: string;
  summary: string;
  color: string;
};

export type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export type ConceptNode = {
  id: string;
  module_id: string;
  section_type?: string;
  name: string;
  definition: string;
  why_it_matters: string;
  key_points: string[];
  example?: string;
  hands_on?: string;
  reading?: string;
  evidence_ids: string[];
  misconception?: string;
  uncertainty?: string;
  quiz?: QuizQuestion[];
};

export type AtlasDocument = {
  title: string;
  overview: {
    definition: string;
    boundary: string;
    essential_question: string;
    key_takeaways: string[];
  };
  modules: AtlasModule[];
  concepts: ConceptNode[];
  relations: Array<{
    id: string;
    source_id: string;
    target_id: string;
    relation_type: string;
    explanation: string;
  }>;
  mechanisms: Array<{
    id: string;
    title: string;
    explanation: string;
    steps: string[];
    concept_ids: string[];
  }>;
  cases: Array<{
    id: string;
    title: string;
    summary: string;
    context?: string;
    lesson?: string;
    concept_ids: string[];
  }>;
  learning_path: Array<{
    id: string;
    title: string;
    objective: string;
    concept_ids: string[];
    estimated_minutes: number;
    checkpoint?: string;
  }>;
  assessments: Array<{
    id: string;
    prompt: string;
    options: string[];
    expected_answer: string;
    related_concept_ids: string[];
  }>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publisher?: string;
    trust_tier: "A" | "B" | "C";
  }>;
  gaps: string[];
};

export type DemoRun = {
  id: string;
  status: RunStatus;
  current_step?: string;
  brief: LearningBrief;
  plan?: FrameworkPlan;
  research_pack?: {
    sources: AtlasDocument["sources"];
    evidence: Array<{
      id: string;
      source_id: string;
      module_id: string;
      statement: string;
      excerpt: string;
      evidence_type: "fact" | "definition" | "case" | "viewpoint" | "dispute";
      confidence: "high" | "medium" | "low";
    }>;
    gaps: string[];
  };
  atlas?: AtlasDocument;
  execution_mode: "live" | "hybrid" | "fixture";
  model_name?: string;
  fallback_notes: string[];
  events: RunEvent[];
  progress: Record<string, "unvisited" | "unclear" | "understood">;
  assessment_results: AssessmentFeedback[];
  growth_complete?: boolean;
  error?: {
    code: string;
    message: string;
    failed_step: string;
    retryable: boolean;
  };
};

export type AssessmentFeedback = {
  assessment_id: string;
  score: number;
  feedback: string;
  review_concept_ids: string[];
};

export type AtlasIndex = {
  conceptsById: Map<string, ConceptNode>;
  modulesById: Map<string, AtlasModule>;
  conceptsByModule: Map<string, ConceptNode[]>;
  relationsByConcept: Map<string, AtlasDocument["relations"][number][]>;
  conceptOrder: Map<string, number>;
  learningOrder: string[];
};

// ── Teaching loop (ADR-0003) ──

export type TeachAction =
  | "introduce_concept"
  | "run_practice"
  | "assess"
  | "schedule_review"
  | "mark_complete";

export type LearningRecord = {
  id: string;
  concept_id: string;
  kind: "insight" | "misconception" | "question";
  note: string;
  created_at: string;
};

export type ConceptMastery = {
  concept_id: string;
  state: "unvisited" | "introduced" | "practicing" | "understood" | "weak";
  mastery: number;
  attempt_count: number;
  last_reviewed_at?: string;
  review_due: boolean;
  records: LearningRecord[];
};

export type LearnerModel = {
  concepts: Record<string, ConceptMastery>;
  steps_taken: number;
  pending_practice_concept_id?: string;
  started_at: string;
  updated_at: string;
};

export type TeachStepResult = {
  action: TeachAction;
  target_concept_id?: string;
  rationale: string;
  message: string;
  question?: string;
  learner_model?: LearnerModel;
  done: boolean;
  budget_remaining: number;
};
