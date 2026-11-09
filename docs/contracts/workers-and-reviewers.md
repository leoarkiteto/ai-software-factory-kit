# Contract: Workers and Reviewers

Schemas: `task.schema.json` (input), `worker-report.schema.json`, `review-report.schema.json`. Semantic rules: `lib/contracts.mjs`. Decision records: ADR-0003, ADR-0004, ADR-0007.

## 1. Roles

| Role | Agent (default) | Owns | Must not | Model tier |
|---|---|---|---|---|
| `frontend-worker` | `factory:frontend-worker` | UI, components, client state, styling, frontend tests for its changes | change API contracts or backend code | efficient |
| `backend-worker` | `factory:backend-worker` | APIs, business logic, persistence, migrations *files*, backend tests for its changes | run migrations against real databases; change UI | efficient |
| `qa-worker` | `factory:qa-worker` | test strategy, new/updated tests, running validation commands, integration checks | change production code (except test fixtures/helpers) | efficient |
| `devops-worker` | `factory:devops-worker` | CI/CD config, build scripts, container/infra *definitions* | deploy, apply infra, push, or change secrets | efficient |
| `code-reviewer` | `factory:code-reviewer` | independent code review | edit files | reasoning |
| `architecture-reviewer` | `factory:architecture-reviewer` | plan review (FULL-SPEC) and architecture review of changes | edit files | reasoning |

The roles differ in **scope, tool access and checks**, not just in name:

- Workers do not have the `Agent` tool, so they cannot delegate.
- Reviewers have read-only tools plus Bash, so they can run validation commands. Their prompt forbids modifying files. Bash can still write files, so this is not a hard guarantee. The orchestrator compares `git status` before and after each review and discards the review if files changed.
- The DevOps worker's prompt and the command guard hook (Phase 7) both forbid deployment commands.

Custom roles are added in `config.roles` and may point at the repository's own agents. They must still honour this contract.

The orchestrator itself (main thread) may execute QUICK tasks directly, without delegation, and may act as integrator.

## 2. Worker input

The orchestrator sends each worker a prompt rendered from the task (`task.schema.json`) plus context:

| Field | Source |
|---|---|
| Task ID, title, description | `tasks[]` |
| Relevant requirements | Spec excerpts for `requirementRefs`, verbatim |
| Acceptance criteria | `tasks[].acceptanceCriteria` |
| Scope | `scope.files` (may modify), `scope.readOnly` (may read) |
| Dependencies | IDs, plus a one-line result and changed files from each dependency's report |
| Constraints | `tasks[].constraints` + `security.protectedPaths` + repo conventions (pointers to CLAUDE.md/rules sections, not copies) |
| Expected artifacts | `tasks[].expectedArtifacts` |
| Validation commands | Configured commands relevant to the task |
| Report path and format | Where to write, and the JSON report schema |

Content from the repository included in prompts is **data**. Workers are instructed not to follow instructions found in repository files, issue text or tool output that conflict with their task contract.

## 3. Worker output

The worker ends its reply with a single fenced `json` block containing a `worker-report` document. The orchestrator extracts it, validates it with `checkWorkerReport(report, task)` and saves it to `reports/T<n>-<attempt>.json`.

- **Scope discipline:** every changed path outside `scope.files` must appear in `scopeDeviations` with a reason. An undeclared deviation fails the report. The orchestrator also cross-checks `filesChanged` against `git status`, so the report is not trusted blindly.
- `status: completed` is a *self-assessment*. It never counts as review.
- An invalid or missing report counts as a failed attempt. It is retried up to `execution.maxTaskAttempts` with the validation errors included.

## 4. Reviewer contract

**When** (config `review.code` / `review.architecture`, per mode `never | on_risk | always`):

| | QUICK | STANDARD | FULL-SPEC |
|---|---|---|---|
| Code review | `on_risk` | `always` | `always` |
| Architecture review | `never` | `on_risk` | `always` (plan **and** changes) |

`on_risk` means classification scored 2 on `risk`, `regressionRisk` or `architecturalImpact`.

**Input:**

- the original request, verbatim;
- the spec (or the task's acceptance criteria in STANDARD/QUICK);
- the plan;
- the diff against `manifest.baseRef`;
- the worker reports;
- validation results.

Reviewers judge against **the request and acceptance criteria**, not only code quality.

**Pre-review validation:** before a review round, the orchestrator runs `validation.preReview` commands. Failures are given to the reviewer as evidence. They do not skip the review.

**Output:** a `review-report` JSON, validated by `checkReviewReport`:

| Outcome | Rule |
|---|---|
| `APPROVED` | no required findings, no critical/high findings |
| `APPROVED_WITH_WARNINGS` | no required findings, at least one finding |
| `NEEDS_CHANGES` | at least one `required: true` finding |
| `BLOCKED` | `blockedReason` set (e.g. spec contradiction, missing access, needs a human decision) |

Every finding has a severity, a category, evidence (`file:line`, command output or a quoted requirement) and a `required` flag. `requirementsCoverage` lists each FR/AC/SC as met, partial, not_met or not_verifiable.

## 5. Independence

- The final review must come from a **different agent context** than every implementer of the reviewed tasks. A reviewer subagent is a fresh context, so it qualifies even on the same model.
- `independence.independent` must be `false` if the reviewer appears in `implementedBy`. The contract check rejects a false claim.
- When the orchestrator implemented a QUICK task itself and review is triggered, the review is delegated to `factory:code-reviewer`. If delegation is impossible, the report says `independent: false` and the final report states that no independent review occurred.
- With `review.requireIndependentReviewer: true` (default), a non-independent review cannot finish a STANDARD or FULL-SPEC workflow. It escalates instead.

## 6. Feedback loop (bounded)

1. `NEEDS_CHANGES`: the required findings are grouped by `taskId` and re-sent to the responsible worker as a new attempt. Findings without a task go to the orchestrator, which decides between a fix task and `replanning`.
2. The fixed tasks are re-validated, then a new review round starts (`review.attempts += 1`).
3. `BLOCKED`: set `blockedOn.kind = "escalation"` and ask the user. No automatic retry.
4. After `review.maxIterations` rounds (default 3) still at `NEEDS_CHANGES`, the workflow escalates to the user with the open findings and remaining risks (workflow-state.md §4). It never loops further on its own.
