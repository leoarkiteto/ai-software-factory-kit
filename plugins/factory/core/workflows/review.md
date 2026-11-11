# Review Procedure

Runs an independent review round while the workflow is `reviewing`. It also covers the FULL-SPEC **plan review** while `planning`.

## Change review (each round)

1. **Pre-review validation.** Run each configured `validation.preReview` command, one Bash call each, and record it with `factory-state validation …`. Failures do not cancel the review: the reviewer receives them as evidence.

2. **Decide which reviews this round needs.** Read `factory-state next <id>`, or the previous review decision. Code review is required by the policy for this mode. Architecture review is required in FULL-SPEC, and when the classification flagged risk. If a review kind is required, run it in every round.

3. **Prepare the round.**
   - Round number: the manifest's `review.attempts + 1`. Both review kinds in the same round use the same number.
   - Implementers: the distinct `assignment.agent` values of the reviewed tasks.
   - **Independence:** never send the work to an agent that implemented any of it. If you (`orchestrator`) implemented a task, the reviewer is still a fresh `factory:code-reviewer` context, which counts as independent.
   - Run `git status --porcelain` and keep the output: this is the **before snapshot**. Run it exactly like that, as its own Bash call: no pipes, hashing (`| md5`), `&&` chains or `git -C`. Those need permissions the user may not have granted.

4. **Brief and launch.** Fill `factory-state guide templates/review-brief`. Then launch the required reviewers as **parallel Agent calls** in one message:
   - `subagent_type` from `factory-state route code-reviewer` / `factory-state route architecture-reviewer`;
   - `model` from `route`, omitted when `route` says so.

5. **Verify the reviewer stayed read-only.** Run `git status --porcelain` again, the same way, and compare the two outputs yourself. If the user's permissions deny it, say so in the final report; do not skip the check silently.
   - If anything changed, **discard that review**: do not submit it.
   - Record an issue (`--severity high --source "orchestrator: reviewer modified files"`) and tell the user what changed. Do not revert it yourself without asking.
   - Re-run that reviewer once with a reminder of the read-only rule. If it happens again, escalate.

6. **Submit each report.** Write the last fenced `json` block, unchanged, to `.factory/workflows/<id>/inbox/review-<kind>.json`. Then run `factory-state review <id> --file .factory/workflows/<id>/inbox/review-<kind>.json`.
   - The command validates the report and prints the **decision**.
   - It rejects a report whose outcome contradicts its findings, or that claims independence while the reviewer is also an implementer. Send that reviewer the errors and ask for a corrected report. Do not correct its judgement yourself.

7. **Act on the decision.** Use the decision printed after the last required review:

   | Decision | What to do |
   |---|---|
   | `await_reviews` | A required review kind is still missing. Run it now. |
   | `integrate` | `factory-state transition <id> integrating --reason "review round <n>: <outcomes>"` |
   | `rework` | See "Rework" below |
   | `escalate` | See "Escalation" below |

## Rework

1. `factory-state transition <id> executing --reason "review round <n> NEEDS_CHANGES: <required finding IDs>"`
2. For each task with required findings: `factory-state task <id> <T> --status pending`. Its next brief carries those findings verbatim in "Previous attempt feedback".
3. Required findings that have no `taskId`: if a fix fits inside an existing task's scope, attach the finding to that task. Otherwise, go to replanning and add a fix task.
4. Continue with `execution.md`. When the tasks complete, a new review round starts. The CLI enforces the limit of `review.maxIterations` rounds (default 3).

## Escalation

This happens when a reviewer returns `BLOCKED`, when the review is not independent where independence is required, or when the iteration limit is reached with changes still required.

1. Record each unresolved required finding with `factory-state issue <id> --severity <s> --source "<reviewer> round <n> <F-id>" --description "…"`.
2. Run `factory-state block <id> --kind escalation --detail "<one line>"`.
3. Present the open findings, the risks of leaving them, and the options:
   - **Accept the risk and integrate:** `factory-state transition <id> integrating --user-approved --reason "user accepted risk: <findings>"`. The final report must list the accepted findings.
   - **Replan:** `transition replanning`.
   - **Stop:** `transition failed`.
4. Wait for the user. Never start a round beyond the limit, and never mark a finding resolved without a fix and a re-review.

## Plan review (FULL-SPEC, while `planning`)

1. Brief `factory:architecture-reviewer` in **plan review** mode:
   - the request, the spec and `plan.md`;
   - the planned task IDs as `subject.taskIds`;
   - `attempt: 1` (or `n` on a re-review);
   - `implementedBy: ["orchestrator"]`, because you wrote the plan.
2. Write its report to the inbox, then run `factory-state plan-review <id> --file .factory/workflows/<id>/inbox/plan-review.json`.
3. Address the required findings by revising the plan, and re-run the plan review. Do this at most `review.maxIterations` times. After that, escalate to the user.
4. Only then ask the user to approve the plan.
