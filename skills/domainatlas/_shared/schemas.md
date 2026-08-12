# DomainAtlas Schema Reference

Shared schema documentation referenced by DomainAtlas agent skills. Skills reference these schemas by name; the full Pydantic definitions live in `backend/src/app/schemas/demo.py`.

## LearningBrief

The user's learning request.

| Field | Type | Description |
|-------|------|-------------|
| domain | str (2-200) | The domain to learn |
| primary_intent | enum | `interest_exploration`, `task_driven`, `cross_domain_connection`, `decision_preparation` |
| learner_background | str (2-1000) | What the learner already knows |
| desired_outcome | str (2-1000) | What they want to achieve |
| learning_time_minutes | int (30-1440) | Available time budget |
| focus_items | list[str] (max 8) | Specific topics to emphasize |
| exclusions | list[str] (max 8) | Topics to explicitly exclude |
| confirmed_scope | str? | Refined scope after calibration |

## BriefCalibration

Scope assessment produced by the planning agent.

| Field | Type | Description |
|-------|------|-------------|
| interpretation | str | How the agent understands the request |
| scope_assessment | enum | `suitable`, `too_broad`, `too_narrow`, `ambiguous` |
| rationale | str | Why this scope assessment |
| suggested_scope | str | Proposed scope boundary |
| questions | list[str] (max 3) | Clarifying questions if ambiguous |
| warnings | list[str] | Cautions about the learning scope |
| can_generate_plan | bool | Whether to proceed with plan generation |

## FrameworkPlan

The confirmed learning framework — the contract between planning and research.

| Field | Type | Description |
|-------|------|-------------|
| goal_summary | str | One-sentence learning goal |
| domain_definition | str | What this domain covers |
| scope | str | What's in and out of scope |
| exclusions | list[str] | Explicitly excluded topics |
| modules | list[FrameworkModule] (3-7) | The learning modules |
| evidence_requirements | list[str] | What kind of evidence is needed |
| learning_sequence | list[str] | Module IDs in recommended order |
| estimated_concepts | int (6-40) | Total concept count (modules × 6) |
| estimated_minutes | int (30-1440) | Estimated learning time |
| completion_criteria | list[str] | How to know when learning is done |

## FrameworkModule

| Field | Type | Description |
|-------|------|-------------|
| id | str | Stable English kebab-case ID |
| title | str | Module title in Chinese |
| purpose | str | Why this module matters |
| priority | enum | `core`, `important`, `optional` |
| core_questions | list[str] (1-5) | Key questions this module answers |

## ResearchPack

Evidence organized by the research agent.

| Field | Type | Description |
|-------|------|-------------|
| sources | list[Source] | All referenced sources |
| evidence | list[EvidenceItem] | Evidence items linked to modules |
| gaps | list[str] | Knowledge gaps found |

## Source

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique source ID |
| title | str | Source title |
| url | str | Source URL (never fabricated) |
| publisher | str? | Publisher name |
| trust_tier | enum | `A` (official/peer-reviewed), `B` (reputable secondary), `C` (user-generated) |

## EvidenceItem

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique evidence ID |
| source_id | str | References a Source.id |
| module_id | str | References a FrameworkModule.id |
| statement | str | What this evidence supports |
| excerpt | str (100-500) | Original passage |
| evidence_type | enum | `fact`, `definition`, `case`, `viewpoint`, `dispute` |
| confidence | enum | `high`, `medium`, `low` |

## AtlasDocument

The complete knowledge atlas — the core output of DomainAtlas.

| Field | Type | Description |
|-------|------|-------------|
| title | str | Atlas title |
| overview | AtlasOverview | Domain overview |
| modules | list[AtlasModule] | Module metadata |
| concepts | list[ConceptNode] | All concept nodes |
| relations | list[ConceptRelation] | Typed edges between concepts |
| mechanisms | list[Mechanism] | Key domain mechanisms |
| cases | list[CaseStudy] | Real-world case studies |
| learning_path | list[LearningStage] | Sequenced learning stages |
| assessments | list[Assessment] | Self-test questions |
| sources | list[Source] | Source catalog (verbatim from research) |
| gaps | list[str] | Unresolved gaps |

## ConceptNode

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique concept ID |
| module_id | str | Parent module |
| name | str | Concept name |
| definition | str | Clear definition |
| why_it_matters | str | Why learn this |
| key_points | list[str] (2-5) | Core takeaways |
| example | str? | Concrete example |
| evidence_ids | list[str] | Supporting evidence IDs |
| misconception | str? | Common misunderstanding |
| uncertainty | str? | What's uncertain or debated |

## ConceptRelation

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique relation ID |
| source_id | str | From concept |
| target_id | str | To concept |
| relation_type | enum | `enables`, `constrains`, `informs`, `evaluates`, `depends_on` |
| explanation | str | Causal or dependency explanation |

## Mechanism

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique mechanism ID |
| title | str | Mechanism name |
| explanation | str | How it works |
| steps | list[str] (3-6) | Step-by-step description |
| concept_ids | list[str] | Related concepts |

## CaseStudy

| Field | Type | Description |
|-------|------|-------------|
| id | str | Unique case ID |
| title | str | Case name |
| summary | str | What happened |
| context | str? | Background |
| lesson | str? | Key takeaway |
| concept_ids | list[str] | Related concepts |

## LearningStage

| Field | Type | Description |
|-------|------|-------------|
| id | str | Stage ID |
| title | str | Stage name |
| objective | str | What to achieve |
| concept_ids | list[str] | Concepts covered |
| estimated_minutes | int | Time for this stage |
| checkpoint | str? | Verifiable completion check |

## Assessment

| Field | Type | Description |
|-------|------|-------------|
| id | str | Assessment ID |
| prompt | str | Question text |
| options | list[str] | Answer choices |
| expected_answer | str | Correct answer (must match an option exactly) |
| related_concept_ids | list[str] | Concepts tested |

## QualityReport

| Field | Type | Description |
|-------|------|-------------|
| scope_coverage | float (0-1) | Domain coverage score |
| structure_quality | float (0-1) | Concept/relation quality |
| grounding_quality | float (0-1) | Source evidence quality |
| learning_quality | float (0-1) | Learning path quality |
| issues | list[QualityIssue] | Specific issues found |
| publishable | bool | Whether atlas meets minimum quality |

## QualityIssue

| Field | Type | Description |
|-------|------|-------------|
| severity | enum | `critical`, `major`, `minor` |
| target_id | str | Which concept/source/relation is affected |
| problem | str | What's wrong |
| suggested_fix | str | How to fix it |

## AssessmentFeedback

| Field | Type | Description |
|-------|------|-------------|
| assessment_id | str | Which assessment was attempted |
| score | float (0-1) | Score achieved |
| feedback | str | Learning feedback |
| review_concept_ids | list[str] | Concepts to review based on results |
