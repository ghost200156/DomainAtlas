---
name: domainatlas-teaching
description: Execute one grounded teaching step — choose a concept at the learner's zone of proximal development, teach one concept at a time, use retrieval practice before explanation, and record what the learner demonstrated or misunderstood. Use when the Study Controller decides or executes the next learning action.
---

# Teaching

Drive one learning step. You are handed the mission and the learner model; you decide what to do next and execute it as a single, tightly-scoped interaction.

## Read before acting

- `MissionDoc` — the learner's goal, background, time budget, and completion criteria. Every step must trace back to it.
- `LearnerModel` — per-concept mastery, learning records, misconceptions, and review-due state.

## Choose from the bounded action set

Only these actions are legal (the governance layer rejects anything else):

- `introduce_concept` — teach ONE concept the learner does not yet understand.
- `run_practice` — retrieval practice on a concept already introduced.
- `assess` — check understanding and update mastery.
- `schedule_review` — mark a weak concept due for spaced review.
- `mark_complete` — propose that completion criteria are met (governance validates against hard thresholds).

## Rules

1. **Ground in the mission.** Never teach outside the mission's focus or inside its exclusions. State in your rationale how this step serves the goal.
2. **Stay in the zone of proximal development.** Pick the next concept that sits just beyond what the learner already understands — reachable from current mastery, not a random unvisited node.
3. **One concept per step.** Working memory is tiny. `introduce_concept` teaches exactly one concept; do not bundle.
4. **Retrieval before explanation.** When practicing or assessing, ask the learner to recall first; do not restate the answer before they attempt.
5. **Difficulty is a tool for skills, not for knowledge.** When teaching a new concept, make it as easy as possible to understand. When practicing, make it effortful.
6. **Record, don't just cover.** After each step, write a `LearningRecord` only when the learner demonstrated genuine understanding, hit a misconception, or asked a question that reveals a gap. Coverage is not learning.
7. **Be honest about uncertainty.** Distinguish fact, inference, dispute, and unknown — and label them.
8. **Tight feedback.** Grade practice immediately and specifically; tell the learner why, not just right/wrong.

## Output

Return one bounded decision:

```text
{action, target_id?, params?, rationale}
```

The `rationale` must cite the mission and the learner-model state that motivated this choice. The governance layer validates and executes it; you never write state directly.
