# Contract: Workflow State and Artifacts

Schema: `plugins/factory/core/schemas/manifest.schema.json` (with `task.schema.json`, `classification.schema.json`).
Enforcement: schema validation in `lib/schema.mjs`; transition rules in `lib/state.mjs` (Phase 3).

## 1. Layout in the target repository

```
.factory/
├── config.json                  # optional; see configuration.md
├── install.json                 # install receipt; see installation.md
└── workflows/
    └── wf-YYYYMMDD-<slug>/
        ├── manifest.json        # machine state (single source of truth)
        ├── classification.md    # human-readable rationale
        ├── discovery-brief.md   # FULL-SPEC only: input to discovery
        ├── discovery-summary.md # FULL-SPEC only: Factory's digest of discovery
        ├── spec.md              # local provider; or a pointer to specs/<feature>/spec.md
        ├── plan.md
        ├── reports/T<n>-<attempt>.json        # worker reports
        ├── reviews/<attempt>-<kind>.json      # review reports
        └── final-report.md
```

Durable domain knowledge (`GLOSSARY.md`, `docs/adr/`) follows the repository's conventions and is only *referenced* from `manifest.artifacts`, never copied into `.factory/`.

Rules:

- `manifest.json` is the only state that skills and hooks read. Markdown artifacts are for humans and reviewers.
- Every write goes through `factory-state` (plugin `bin/`, on the Bash tool's `PATH`), which validates before it writes, stamps `updatedAt`, and writes atomically. Run `factory-state help` for commands. Exit codes: `0` ok, `1` rejected by a rule (message explains why), `2` usage error.
- There is no file locking. Only the orchestrator (main thread) writes manifests; workers return reports in their reply and never call `factory-state`.
- Artifact paths are repo-relative. Absolute paths and `..` are rejected by the schema.
- Never write secrets, tokens or the contents of `security.protectedPaths` into any artifact.

## 2. Status model

Statuses are stored lowercase (`full_spec`, `executing`) and displayed uppercase (`FULL-SPEC`, `EXECUTING`).

| Status | Meaning |
|---|---|
| `classifying` | Rubric being scored; mode not final |
| `discovering` | Discovery provider running (FULL-SPEC) |
| `specifying` | Formal specification being consolidated and checked |
| `planning` | Technical plan and task DAG being produced (STANDARD includes brief clarification here) |
| `executing` | Workers running ready tasks |
| `reviewing` | Independent review in progress |
| `replanning` | Plan or DAG being revised after failure or review |
| `integrating` | Final validation commands and acceptance check against the original request |
| `completed` | Terminal: final report written |
| `failed` | Terminal unless explicitly resumed into `replanning` |

### Waiting is not a status

When the workflow is waiting for something outside the agent's control, it keeps its status and sets `blockedOn` (`user_input`, `user_approval`, `discovery_session`, `external_dependency`, `escalation`). For example, a FULL-SPEC workflow waiting for the user to type `/grill-with-docs` is `status: discovering` with `blockedOn.kind: discovery_session`. Resuming clears `blockedOn`.

### Allowed transitions

```
classifying  → discovering | planning | executing | failed
discovering  → specifying | failed
specifying   → planning | discovering | failed
planning     → executing | specifying | failed
executing    → reviewing | integrating | replanning | failed
reviewing    → executing | replanning | integrating | failed
replanning   → planning | executing | failed
integrating  → completed | executing | replanning | failed
failed       → replanning              (explicit user-approved resume only)
```

### Stages per mode

| Mode | Stages visited | Notes |
|---|---|---|
| `quick` | classifying → executing → [reviewing if `review.code.quick` triggers] → integrating → completed | Usually a single task done in the main thread, with no delegation |
| `standard` | classifying → planning → executing ⇄ reviewing → integrating → completed | Brief clarification happens inside `planning` |
| `full_spec` | classifying → discovering → specifying → planning → executing ⇄ reviewing → integrating → completed | `discovering → specifying` requires discovery completion (discovery-provider.md) |

`lib/state.mjs` rejects transitions into stages the current mode does not visit. A mode change (escalation, for example quick → standard when the task turns out bigger) is only allowed through `replanning` or from `classifying`. It is recorded as `history[].modeChange` and as `classification.override.by = "escalation"`.

### Every transition records

`history[]` gets `{ at, from, to, reason }`. The reason is mandatory and must be specific ("review attempt 2 returned NEEDS_CHANGES: F1"), not "continuing".

## 3. Task DAG

- `tasks[].dependsOn` must reference existing task IDs, and the graph must be acyclic (validated on every write).
- A task is **ready** when it is `pending` and every dependency is `completed`.
- Two ready tasks may run in parallel only when `execution.parallel` is true and their `scope.files` globs do not overlap (`globsMayOverlap`, which is conservative). Otherwise they run sequentially (ADR-0007).
- `isolation: "worktree"` is allowed only when `execution.worktreeIsolation` is `opt_in` and every dependency's output is already committed.
- **Failure propagation:** when a task becomes `failed` after `execution.maxTaskAttempts`, every transitive dependant becomes `blocked`, with `blockedReason` naming the failed task. The workflow moves to `replanning`.
- Integration checkpoints are explicit tasks (role `qa-worker`, or the orchestrator itself) that depend on the tasks they integrate.

## 4. Review accounting

- `review.attempts` counts review rounds, not individual reports. Code and architecture review in the same round share one attempt number.
- `review.maxIterations` is copied from config when the workflow is created, so changing config later does not change a running workflow.
- When `attempts == maxIterations` and the latest outcome is still `NEEDS_CHANGES`, the workflow does not start another round. It sets `blockedOn.kind = "escalation"`, records the open findings as `issues[]` with status `escalated`, and asks the user to decide (accept risk, replan, or stop).

## 5. Resumability

A session can resume a workflow from `manifest.json` alone:

1. `status` + `blockedOn` say what is pending.
2. `tasks[]` with statuses, plus the latest report per task, give execution progress.
3. `review.history` gives the review position.
4. `artifacts` point to every document needed to rebuild context.

`running` tasks found on resume are treated as interrupted. Their files are inspected with `git status` and `git diff`, and they are re-run as a new attempt or marked `failed`, never assumed completed.
