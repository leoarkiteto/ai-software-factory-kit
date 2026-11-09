# STANDARD Workflow

For moderate features and multi-file or multi-component changes. Lightweight planning, delegation where it helps, and independent review.

Stages: `classifying → planning → executing ⇄ reviewing → integrating → completed`

## 1. Enter planning

`factory-state transition <id> planning --reason "classified standard: <short rationale>"`

## 2. Brief clarification

- List only the questions that change behaviour or scope and that the repository cannot answer. Ask them in **one** numbered round, each with your recommended answer (`block --kind user_input` while waiting). Ask nothing if there are no such questions.
- Restate the agreed scope in 2–4 bullets: in scope, and explicitly out of scope.

## 3. Technical plan

Write `.factory/workflows/<id>/plan.md` from `${CLAUDE_PLUGIN_ROOT}/core/templates/plan.md`. In STANDARD the spec lives inside the plan, in its reduced form (Summary, Scope, FR, AC, Validation). Then record it with `factory-state artifact <id> plan .factory/workflows/<id>/plan.md`.

Decompose the work into tasks (`${CLAUDE_PLUGIN_ROOT}/core/workflows/decomposition.md`) and write them to `.factory/workflows/<id>/inbox/tasks.json` and record them with `factory-state tasks <id> --file .factory/workflows/<id>/inbox/tasks.json`.

## 4. Approval

Show the user the plan summary and the task table, then `block --kind user_approval`. When they approve: `factory-state transition <id> executing --reason "plan approved by user"`. If they request changes, revise and ask again.

## 5. Execute

Follow `${CLAUDE_PLUGIN_ROOT}/core/workflows/execution.md`.

## 6. Review

When `factory-state next <id>` says `review`: `factory-state transition <id> reviewing --reason "all tasks completed"`. Then follow `${CLAUDE_PLUGIN_ROOT}/core/workflows/review.md`. Code review is always required in STANDARD. Architecture review is required when the classification flagged risk.

## 7. Integrate and finish

Same as QUICK step 6. In addition, check every acceptance criterion in the plan against the final state of the code, and record any criterion that is not met as an issue (`factory-state issue`). Unmet criteria block completion unless the user explicitly accepts them.
