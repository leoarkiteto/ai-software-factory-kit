# Phase 5: Real Scenario Runs

These are real headless Claude Code 2.1.319 sessions with the plugin loaded via `--plugin-dir`. They are **end-to-end runs, not mocks**. Orchestrator: session default (Opus). Workers and reviewers: per-call aliases from config (`sonnet` and `opus`).

| # | Scenario | Result | Turns | Cost (USD) | Denials |
|---|---|---|---|---|---|
| P1 | Worktree probe (Haiku) | Facts recorded in ADR-0007; worktree isolation deferred | — | ~0.03 | 0 |
| B1 | STANDARD `/factory:start` slugify + clamp | Plan with 2 disjoint tasks; raised 2 ambiguities with recommendations; paused for approval; no code changed | 20 | 0.42 | 0 |
| B2 | `/factory:resume approved` (new session) | Both `backend-worker`s launched **in parallel** (same message, `model: sonnet`); work done; orchestrator then **denied** `factory-state`/inbox writes after workers returned. It stopped honestly → ADR-0010 | 3 | 0.50 | 2 |
| B3 | `/factory:resume` with the ADR-0010 allow rules | Recovered the 2 interrupted tasks by verifying the code and tests itself (and said so); independent `code-reviewer` APPROVED; completed. The implementation was checked independently afterwards (all specified cases correct) | 31 | 0.70 | 0 |
| C1 | `/factory:resume` on a seeded STANDARD workflow with a **planted defect** (missing `RangeError` guard and test) | Round 1 `NEEDS_CHANGES`: F1 (high, requirements) and F2 (high, testing), both required, with line evidence; F3 low, not required. Rework by `backend-worker` (attempt 2, failures 0). Round 2 `APPROVED`. Completed with tests 4/4 | 50 | 1.01 | 0 |

## Defects found and fixed during this phase

1. Retry vs. replan: `next` returned `replan` for a failed task that still had attempts left. Now returns `retry_tasks` (unit-tested).
2. Review rework consumed the failure budget: tasks now track `failures` separately from `attempts` (unit-tested).
3. A missing `--file` input crashed the CLI with a stack trace. Now a clean rejection (unit-tested).
4. Skill pre-approval expires after delegation (B2). Documented, with durable rules (ADR-0010).

## Not covered yet

- An escalation in a real session (BLOCKED, or the iteration limit reached). Covered only by unit tests.
- Failure of a worker followed by retry, and replanning, in a real session. Covered only by unit tests.
- `frontend-worker`, `qa-worker` and `devops-worker` in real sessions. Their definitions are structurally tested only.
- The `architecture-reviewer`, in either change or plan mode, in a real session.
- Repeatability: each scenario ran once.
