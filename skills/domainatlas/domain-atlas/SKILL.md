---
name: domain-atlas
description: Build a structured knowledge map of an unfamiliar domain. Creates an interactive atlas with concept nodes, relations, mechanisms, case studies, learning paths, and self-assessments. Use when the user wants to learn a new domain systematically.
disable-model-invocation: true
---

# DomainAtlas

Orchestrate a multi-stage learning pipeline for turning an unfamiliar domain into an interactive, explorable knowledge atlas.

## Pipeline stages

1. **Plan** — Invoke `domainatlas-planning` to calibrate scope and generate a bounded `FrameworkPlan` with 4–6 modules.
2. **Confirm** — Present the framework to the user. Wait for explicit confirmation or edits before proceeding. Never skip this checkpoint.
3. **Research** — Invoke `domainatlas-research` to gather evidence from controlled sources for each module.
4. **Build** — Invoke `domainatlas-atlas` to construct the full `AtlasDocument` with concepts, relations, mechanisms, cases, and assessments.
5. **Validate** — Run deterministic checks: schema, references, coverage, graph connectivity.
6. **Present** — Render the atlas as an interactive knowledge map the user can explore, mark progress on, and self-test against.

## Rules

- Keep the user in control. Between Plan and Research, the user MUST confirm the framework.
- Each agent stage has a bounded responsibility — do not mix planning with research or research with atlas building.
- All sources must be tracked. Evidence items must reference their source IDs.
- Distinguish facts, inferences, disputes, and unknowns clearly.
- Use Chinese for output; use stable English kebab-case for IDs.
- On model or network failure in `auto` mode, fall back gracefully to fixture data and mark the result as `hybrid`.

## Input required

The user must provide (or be asked for):
- Domain name (2–200 chars)
- Learning intent: interest exploration / task-driven / cross-domain connection / decision preparation
- Learner background (2–1000 chars)
- Desired outcome (2–1000 chars)
- Available time in minutes (30–1440)
- Optional: focus items, exclusions

Ask for missing fields before starting the pipeline.
