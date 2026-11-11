# Use cases: what the developer types in each mode

The three examples below use the same React Native + Go monorepo as the [walkthrough](monorepo-walkthrough.md), already set up with `/factory:init`. Each one shows:
- why the kit picks the mode;
- the stages;
- **every command you type, and when**.

The mode is computed by `factory-state classify` from rubric scores ([rubric](../../plugins/factory/core/rubric.md)). The thresholds are:
- QUICK when the total is below 5;
- STANDARD from 5;
- FULL-SPEC from 12, or whenever `architecturalImpact` is 2.

The scores below are what the orchestrator should find. The real ones depend on your code.

## Summary

| | QUICK | STANDARD | FULL-SPEC |
|---|---|---|---|
| Example | Order date shown in UTC | Pagination for orders (API + mobile) | SSO authentication and authorization |
| Commands you type | `/factory:start` and, at the end, your own git commit | `/factory:start`, answers to one question round, plan approval, git commit | `/factory:start`, `/grill-with-docs`, several `/factory:resume` (discovery, spec, plan), git commit |
| Pauses for you | none (unless confirmation is needed) | questions (if any), plan approval | discovery, spec approval, plan approval |
| Plan / spec | none | `plan.md` with FR and AC | `discovery-summary.md`, `spec.md`, `plan.md` |
| Who implements | the orchestrator itself | workers (in parallel when files do not overlap) | workers (in parallel when files do not overlap) |
| Reviews (default) | code review only if a risk dimension is 2 | code review always; architecture review on risk | code + architecture review always, plus a review of the plan |

You can interrupt or resume any mode at any time with `/factory:resume`.

---

## 1. QUICK: order date shown in UTC

**Situation.** On the order details screen, the date appears in UTC instead of the device's local time. The bug is in a formatting helper in `mobile/`.

```text
/factory:start The order date on the OrderDetails screen is shown in UTC; it should use the device's local time zone. The formatting is in mobile/src/utils/date.ts.
```

**Expected classification** (total 2 → QUICK):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 |

**What happens.** `classifying → executing → integrating → completed`

1. The orchestrator reads `date.ts`, its callers and its tests, and records a single task T1 with its files.
2. It fixes the helper **itself**, without delegating, and adds or adjusts the test.
3. It runs `make test` and `make lint`, and records the results.
4. There is no review: no risk dimension scored 2 (`review.code.quick: on_risk`).
5. It writes a short `final-report.md` and gives you a 3–6 line summary.

**What you type:**

| # | When | You type |
|---|---|---|
| 1 | Start | `/factory:start <request>` |
| 2 | Only if the kit asks you to confirm the mode (low confidence) | `/factory:resume yes` |
| 3 | After the summary | `git diff`, then `git commit` yourself |

That is the whole interaction. If the fix turns out bigger than expected (for example, the API also sends dates in the wrong format), the orchestrator tells you and escalates to STANDARD, keeping the workflow.

---

## 2. STANDARD: pagination for the orders list

**Situation.** `GET /orders` returns every order, and the mobile list gets slow. You want cursor-based pagination in the API and infinite scroll in the app.

```text
/factory:start Add cursor-based pagination to GET /orders in the Go API (limit + cursor, default 20) and infinite scroll in the mobile OrdersList screen. Keep the current response fields.
```

**Expected classification** (total 8 → STANDARD):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 2 | 0 | 1 | 1 | 1 | 0 | 0 |

`components = 2` (it crosses mobile and API), but `architecturalImpact` is only 1, so the request does not escalate to FULL-SPEC.

**What happens.** `classifying → planning → executing ⇄ reviewing → integrating → completed`

1. **Questions, in one round.** The orchestrator asks only what the code cannot answer, each question with a recommended answer. For example:
   - "1. Is a cursor based on `created_at,id` acceptable? (recommended: yes)"
   - "2. Should the old non-paginated behaviour remain for other clients? (recommended: no)"

   If nothing is open, it asks nothing.
2. **Plan.** `plan.md` with scope (in and out), FR, AC and validation, plus a task table:

   | Task | Worker | Files | Depends on |
   |---|---|---|---|
   | T1 Pagination contract (query params, `nextCursor`) | backend | `api/internal/orders/contract.go` | — |
   | T2 Paginated query + handler | backend | `api/internal/orders/**`, `api/internal/http/orders*.go` | T1 |
   | T3 Infinite scroll + API client | frontend | `mobile/src/screens/OrdersList/**`, `mobile/src/api/orders.ts` | T1 |
   | T4 Tests for the AC | qa | `api/internal/orders/*_test.go`, `mobile/__tests__/orders*` | T2, T3 |
3. **Execution.** T1, then T2 and T3 **in parallel**, then T4. Each worker returns a validated report.
4. **Validation and review.**
   - `make lint`, `make typecheck` and `make test` run.
   - The `code-reviewer` reviews independently. The architecture review is skipped, because no risk dimension is 2.
   - Requested changes lead to rework and a new review, at most 3 rounds.
5. **Integration.** `make build` runs and every AC is checked. Unmet criteria become issues that you must accept explicitly. Then comes the final report.

**What you type:**

| # | When | You type |
|---|---|---|
| 1 | Start | `/factory:start <request>` |
| 2 | The workflow pauses with numbered questions | `/factory:resume 1 yes, 2 no` (or `/factory:resume use the recommendations`) |
| 3 | The workflow pauses with the plan and the tasks | `/factory:resume approved`, or `/factory:resume change: …` |
| 4 | Only if the review loop escalates (3 rounds without approval) | `/factory:resume accept the risk: …`, or guidance, or `stop` |
| 5 | After the final report | review `git diff`, then commit / PR yourself |

---

## 3. FULL-SPEC: SSO authentication and authorization

**Situation.** The app has no login. You want SSO with the company IdP on mobile and role-based authorization in the API. The full step-by-step is in the [walkthrough](monorepo-walkthrough.md#part-b-sso-authentication-and-authorization).

```text
/factory:start Add SSO authentication and authorization. The mobile app must let users sign in through the company IdP (OIDC, probably Entra ID). The Go API must validate tokens and enforce role-based authorization (admin, manager, user) on the existing endpoints.
```

**Expected classification** (total 17, and `architecturalImpact = 2` alone would already escalate → FULL-SPEC):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 0 | 1 |

**What happens.** `classifying → discovering → specifying → planning → executing ⇄ reviewing → integrating → completed`

1. **Discovery.** You and `/grill-with-docs` settle the IdP, the flows, the tokens, the roles and provisioning. The result is `GLOSSARY.md`, ADRs and `discovery-summary.md`.
2. **Spec.** `spec.md` with FR, NFR and AC, checked by `spec-check`. You approve it.
3. **Plan.** Contracts come first, then the task DAG (backend, frontend, qa, devops). The `architecture-reviewer` reviews the plan, then you approve it.
4. **Execution.** Workers run in parallel when their files do not overlap. `.env` and the keystores are protected, and push and deploy are blocked.
5. **Reviews.** Code review and architecture review are both required, with at most 3 rework rounds.
6. **Integration.** Every FR, NFR and AC is marked met, partial or not met, with evidence, in the final report.

**What you type:**

| # | When | You type |
|---|---|---|
| 1 | Start | `/factory:start <request>` |
| 2 | Only if the kit asks you to confirm the mode | `/factory:resume yes` |
| 3 | The workflow pauses for discovery | `/grill-with-docs @.factory/workflows/<id>/discovery-brief.md` (the exact line is shown to you). Then answer its questions until it ends |
| 4 | Discovery has ended | `/factory:resume` |
| 5 | The workflow pauses with the spec summary (scope, FR, AC) | `/factory:resume yes, approved`, or `/factory:resume change FR-4: …` |
| 6 | The workflow pauses with the reviewed plan and tasks | `/factory:resume approved`, or `/factory:resume change: …` |
| 7 | Only on escalation (review rounds exhausted, a task failed twice, an unmet AC) | `/factory:resume <decision or guidance>` |
| 8 | After the final report | review `git diff`, then commit / PR yourself |

If `/grill-with-docs` is not installed, step 3 changes. The kit offers three options:
- install it, then resume;
- `/factory:resume use the native fallback`: the orchestrator interviews you itself, in rounds, and each answer is a `/factory:resume <answers>`;
- stop.

---

## Commands that work in any mode

| Need | Command |
|---|---|
| Continue after a pause, a closed session or a usage limit | `/factory:resume` (or `/factory:resume <id>` when several workflows are active) |
| Force a mode | `/factory:start --mode quick\|standard\|full_spec <request>` (the reason is recorded) |
| See the state and the next step | `factory-state show [id]`, inside Claude Code or `<plugin>/bin/factory-state` in a terminal |
| List workflows | `factory-state list` |
| Check the config | `factory-state config` |

Always type the slash command at the **start** of the message. Otherwise no skill runs.
