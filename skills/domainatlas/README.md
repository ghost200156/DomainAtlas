# DomainAtlas Skills

Knowledge-map-style domain learning agent skills. These skills work together to turn an unfamiliar domain into an interactive, explorable cognitive framework.

Each skill is a bounded agent stage — they handle specific tasks in the learning pipeline and nothing else.

## User-invoked

Skills reachable only when you explicitly type the slash command. They orchestrate workflows.

- **[domain-atlas](./domain-atlas/SKILL.md)** — Orchestrate the full learning pipeline: create a LearningBrief → calibrate scope → confirm framework → research evidence → build atlas → explore & self-test.

## Model-invoked

Skills the agent can reach for automatically when the task fits. They hold reusable discipline.

- **[planning](./planning/SKILL.md)** — Calibrate scope and generate a bounded learning framework with 4–6 modules and core questions.
- **[research](./research/SKILL.md)** — Collect and organize evidence from controlled sources into a structured research pack.
- **[atlas](./atlas/SKILL.md)** — Build a comprehensive knowledge atlas with concept nodes, relations, mechanisms, cases, and assessments.

## Extension skills (Phase 2)

- **[reviewer](./reviewer/SKILL.md)** — Independently review an AtlasDocument for coverage, consistency, and learning quality.
- **[multi-source-research](./multi-source-research/SKILL.md)** — Extend research beyond Wikipedia to arXiv, GitHub, and official documentation.
- **[review-path](./review-path/SKILL.md)** — Generate personalized review routes from assessment results and learning progress.
