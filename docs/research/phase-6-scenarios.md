# Phase 6: Real FULL-SPEC Run (discovery and specification)

This was a single conversation, continued with `claude -p --resume`, against a fixture order service: `src/orders.js` (full refunds only), its tests, and Spec Kit 1.0.1 initialised with `specify init --integration claude`. `/grill-with-docs` came from the user's skills.sh install. These are **real runs, not mocks**.

| Step | Prompt (as the user) | Result | Cost (USD, cumulative per session) |
|---|---|---|---|
| 1 | `/factory:start Support partial refunds…` | FULL-SPEC (score 10). The brief listed repository facts and 8 open questions. Status `discovering` with `blockedOn: discovery_session`. Exact `/grill-with-docs @brief` instruction. No code changed | 0.45 |
| 2 | `/grill-with-docs @…/discovery-brief.md` | The skill ran its own process: proposed terms, 8 numbered questions with recommendations and code references. **`@file` reached the skill** | 0.55 |
| 3 | "Yes to all…" | `GLOSSARY.md` written. Round 2: Q9 (a conflict between earlier answers), Q10 (offer of an ADR), Q11 (a scenario) | 0.67 |
| 4 | "Yes to Q9–Q11" | `docs/adr/0001-refunds-by-amount-not-line-item.md` written. Full statement of shared understanding | 0.75 |
| 5 | "Yes…" then `/factory:resume` *in the same message* | The skill was **not invoked** (the message did not start with `/`). The summary was written and `discovery-check` passed. Then the orchestrator was denied reads of plugin files and **refused to guess the spec procedure**, which led to the `factory-state guide` fix | 1.10 |
| 6 | `/factory:resume … continue` | Spec Kit selected (`auto`). `speckit-specify` created `specs/001-partial-refunds/spec.md` (12 FR, 4 SC); `plan.md` got the supplements (3 NFR) and the mapping (15 AC). `spec-check` passed. Paused for approval | 1.72 |
| 7 | `/factory:resume … Spec approved` | `plan.md` + DAG (T1 backend → T2 QA). The **architecture-reviewer** reviewed the plan: `APPROVED_WITH_WARNINGS`, F1–F5. F2 caught a real defect before any code existed. Findings folded into the plan; paused for approval | 2.81 |
| 8 | `/factory:resume … Plan approved` | T1 dispatched to `backend-worker` (`sonnet`). **The account's usage limit was hit mid-task.** The workflow was left `executing` with T1 `running`, a recoverable interrupted state | 3.04 |
| 9 | `/factory:resume … continue` (after the limit reset) | Recovered interrupted T1 (attempts 3, failures 1). The orchestrator fixed a worker defect itself (amount validation accepted a function), recorded `agent: orchestrator` and disclosed it. `qa-worker` T2 wrote the tests (29/29 pass). **Code review and architecture change review** ran in parallel, both independent, both `APPROVED_WITH_WARNINGS`. Low findings recorded as issues I1 and I2. Completed. **No commit was made**: the orchestrator asked the user | 6.94 |

The total was about 17 USD across the session steps, as reported by the CLI per invocation.

## Verified in this run

- Detection of `/grill-with-docs` (user scope) and of Spec Kit 1.0.1, plus provider selection, all against the real environment.
- User-invoked handoff to `/grill-with-docs`, `@file` brief delivery, and resume after a multi-round session. The provider was recorded with evidence.
- Gates enforced by the CLI on real artifacts: `discovery-check` (discovering → specifying) and `spec-check` (specifying → planning) with Spec Kit plus supplements.
- Architecture plan review recorded via `plan-review`.
- FULL-SPEC end to end: interrupted-task recovery, `qa-worker`, parallel code and architecture change reviews, integration against the spec, and completion with open low issues.

## Defects and findings

1. **Plugin file reads outside the skill's turn need permission.** This surfaced when the user's message did not start with the slash command. Fixed: every procedure and template is now served by `factory-state guide <name>`, covered by the single durable rule `Bash(factory-state *)`. Tests ensure no orchestrator file reads plugin paths directly.
2. `/grill-with-docs` (`domain-modeling`) reads its own format files from `~/.claude/skills/…`. Outside the project, this needs read approval. Documented.
3. Spec Kit's `speckit-specify` writes `.specify/feature.json`. Repositories using Spec Kit need `Edit(/.specify/**)` (or approval). Documented.

## Not covered (still open after this phase)

- The native discovery fallback and the local spec provider in a real session. Both are unit-tested only.
- `grill-with-docs` unavailable in a real session: unit-tested only (detection with fake homes).
