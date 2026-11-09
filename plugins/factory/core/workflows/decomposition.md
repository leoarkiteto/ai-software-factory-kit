# Task Decomposition

Turn the plan into a DAG that `factory-state tasks` accepts (`schemas/task.schema.json`).

## Rules

- **Size:** one task is one coherent change a single worker can finish and verify in one go. Aim for 2–8 tasks in STANDARD. Splitting further is justified by distinct roles or by real parallelism, not by habit.
- **Role:** pick the worker role whose boundary fits (`factory-state config` → `roles`, kind `worker`). Do not give one task both frontend and backend changes; split it, with a contract task first if needed.
- **Scope:** `scope.files` lists the globs the task may modify, as narrow as you can honestly make them. Put context-only paths in `scope.readOnly`. The scheduler only runs two tasks in parallel when their `scope.files` cannot overlap, so vague scopes like `src/**` serialise everything.
- **Dependencies:** `dependsOn` only real prerequisites: an interface it consumes, a file it builds on, a fixture it needs. QA test-writing can often depend only on the contract task, not on the implementation.
- **Acceptance criteria:** observable and checkable, traceable to `FR`/`AC` through `requirementRefs`.
- **Integration checkpoint:** when two or more tasks must fit together (UI + API), add a final integration task, usually `qa-worker`, that depends on them and runs the integration-level checks.
- **Isolation:** leave `isolation` at its default (`shared`). Use `"worktree"` only for an independent task whose dependencies are already committed, and only if config allows it (ADR-0007).
- **Parallelism is optional.** If the tasks are tightly coupled, a short sequential chain is better than artificial parallelism.

## Template

```json
[
  { "id": "T1", "title": "Define refund API contract (types + route stub)", "role": "backend-worker",
    "dependsOn": [], "status": "pending",
    "scope": { "files": ["src/api/refunds/types.ts", "src/api/refunds/routes.ts"] },
    "requirementRefs": ["FR-1"], "acceptanceCriteria": ["Types exported; route returns 501"] },
  { "id": "T2", "title": "Implement refund endpoint", "role": "backend-worker", "dependsOn": ["T1"], "status": "pending",
    "scope": { "files": ["src/api/refunds/**", "src/ledger/refund*.ts"] }, "requirementRefs": ["FR-1", "FR-2"],
    "acceptanceCriteria": ["AC-1 and AC-2 pass"] },
  { "id": "T3", "title": "Refund dialog", "role": "frontend-worker", "dependsOn": ["T1"], "status": "pending",
    "scope": { "files": ["web/src/refunds/**"], "readOnly": ["src/api/refunds/types.ts"] }, "requirementRefs": ["FR-3"],
    "acceptanceCriteria": ["AC-3"] },
  { "id": "T4", "title": "Refund integration tests", "role": "qa-worker", "dependsOn": ["T2", "T3"], "status": "pending",
    "scope": { "files": ["tests/refunds/**"] }, "requirementRefs": ["FR-1", "FR-2", "FR-3"], "acceptanceCriteria": ["All AC covered by tests"] }
]
```

Here T2 and T3 run in parallel after T1, because their scopes are disjoint.

After `factory-state tasks` accepts the DAG, render it as a table in `plan.md` (ID, title, role, depends on, scope).
