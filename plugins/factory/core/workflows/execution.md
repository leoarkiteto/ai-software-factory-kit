# Execution Procedure

Runs the task DAG while the workflow is `executing`. You, the orchestrator, schedule the tasks, brief the workers and record the results. The workers implement.

## Loop

Repeat until `factory-state next <id>` returns something other than `run_tasks` or `await_tasks`.

### 1. Ask what to run

`factory-state next <id>` returns:

| Result | What to do |
|---|---|
| `run_tasks` + task IDs | Start all of them **in parallel** (step 2). The scheduler has already checked that their file scopes do not overlap. |
| `retry_tasks` + task IDs | For each one, run `factory-state task <id> <T> --status pending`, then start it again as in step 2, with the failure feedback in the brief. |
| `review` | Go to `review.md`. |
| `integrate` | Return to the playbook's integrate step. |
| `replan` | Go to "Failures and replanning" below. |
| `await_tasks` | A task is still `running` from an interrupted session. See `resume` step 5. |

### 2. Start each task

For each task ID:

1. `factory-state route <role>` gives the agent name and the model alias, or tells you to omit the model.
2. `factory-state task <id> <T> --status running --agent <agent> --model <alias|null>`
3. Fill `factory-state guide templates/worker-brief` for this task, using:
   - the manifest and `plan.md`;
   - the spec excerpts for `requirementRefs`;
   - the dependency results, taken from their reports in `.factory/workflows/<id>/reports/`;
   - for a rework attempt, the review findings for this task.

   Quote requirements verbatim. Do not paste whole files into the brief: point to paths.

Then launch every worker in the batch **in a single message, as parallel Agent tool calls**:
- `subagent_type` is the agent from `route`;
- `model` is the alias from `route`. Omit it when `route` says so;
- `prompt` is the filled brief;
- **never** set `isolation`, because worktree isolation is not supported in this version (ADR-0007).

**When parallel is not worth it.** If the batch is a single small task, or the remaining work is quicker to do than to brief, you may implement a task yourself. Record `--agent orchestrator`. Any review of that work must then come from a different agent.

### 3. Collect each result

When a worker returns:

1. **Extract the report.** Take the last fenced `json` block of its reply. Write it, **unchanged**, to `.factory/workflows/<id>/inbox/<T>-report.json`. You may fix JSON syntax, but never the claims.
2. **Submit it.** `factory-state report <id> <T> --file .factory/workflows/<id>/inbox/<T>-report.json`
   - If it is rejected (schema, attempt mismatch, or an undeclared file outside scope), treat the attempt as failed: `factory-state task <id> <T> --status failed --result "invalid report: <reason>"`, and include the rejection in the next attempt's brief.
3. **Cross-check against git.** Run `git status --porcelain`. Every changed or new path inside the task's scope should appear in its report's `filesChanged`. A changed file that no running task's scope covers is an **undeclared change**. Record it with `factory-state issue <id> --severity high --source "orchestrator: git cross-check" --description "…" --task <T>`. Do not silently revert it; tell the user.
4. **Record the outcome:**

   | Report status | Command |
   |---|---|
   | `completed` | `factory-state task <id> <T> --status completed --result "<summary>"` |
   | `partial` or `failed` | `factory-state task <id> <T> --status failed --result "<summary>"` |
   | `blocked` | `factory-state task <id> <T> --status blocked --blocked-reason "<blockedReason>"`. If the reason is a decision only the user can make, ask them (`block --kind user_input`). |

5. **Retry.** A failed task with failures left comes back from `next` as `retry_tasks`. The next brief must say what went wrong.

## Failures and replanning

When `next` says `replan` (a task failed permanently or a task is blocked):

1. `factory-state transition <id> replanning --reason "<T> failed <n> times: <cause>"`. Tasks blocked by a failed dependency are already marked.
2. Decide on the fix: change the approach, split the failing task, add a missing prerequisite, or ask the user.
3. Write the revised DAG and submit it with `factory-state tasks <id> --file …`. Keep completed tasks as they are. Mark redefined tasks `pending`.
4. If the scope, requirements or approach changed, get the user's approval. Then `transition planning` (STANDARD/FULL-SPEC, to re-approve) or straight to `executing` (for small corrections).

**Never silently drop a failing task or weaken its acceptance criteria.** Any reduction of scope needs the user's explicit approval, and is recorded as an issue with status `accepted_risk`.
