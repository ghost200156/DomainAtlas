# DomainAtlas Workflow Rules

These are the deterministic rules the orchestrator enforces between agent stages. Agents must follow these, but the Python orchestrator is the authority.

## State Machine

```
PREPARING_PLAN → WAITING_CONFIRMATION → GENERATING → READY
                                              └→ FAILED
```

## Internal Steps

```
calibrating → planning → waiting_confirmation → researching
→ building_structure → validating → reviewing → publishing → ready
```

## Key Constraints

1. **Confirmation Gate**: The user MUST confirm the FrameworkPlan before research begins. No exceptions.
2. **Source Constraint**: Research and Atlas agents can only reference sources from the controlled candidate pack. New URLs are rejected by the validator.
3. **Schema Validation**: Every agent output is validated against its Pydantic schema. Validation failures block the pipeline.
4. **Graph Connectivity**: The Atlas concept graph must be connected — every concept reachable from every other via relations.
5. **Reference Integrity**: All concept IDs, module IDs, source IDs, and evidence IDs must reference valid entities. Dangling references are repaired or rejected.
6. **Minimum Outputs**: Atlas must have ≥3 modules, ≥3 concepts per module, each concept must have ≥1 relation.
7. **Fallback**: In `auto` mode, model failures fall back to fixture data. In `live` mode, failures propagate as errors.

## Execution Modes

| Mode | Live Model | On Failure |
|------|-----------|------------|
| `auto` | Yes | Fallback to fixture, mark `hybrid` |
| `live` | Yes | Raise error, mark `FAILED` |
| `fixture` | No | Always use fixtures |

## Agent Boundaries

- **Planning Agent**: Scope + framework only. No research. No claims about facts.
- **Research Agent**: Evidence organization only. No new sources. No atlas structure.
- **Atlas Agent**: Structure from confirmed plan + research. No new evidence. No scope changes.
- **Reviewer Agent** (Phase 2): Quality assessment only. Does not modify the atlas.
- **Multi-Source Research Agent** (Phase 2): Supplementary evidence only. Extends, never replaces, primary research.
- **Review Path Agent** (Phase 2): Learning recommendations from assessment data. Does not modify concepts.
