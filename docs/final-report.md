# AI Software Factory Kit: final implementation report

**Current release: 0.2.1-beta (2026-11-12). See §8 for what beta means and the 1.0 criteria.** Sections 1–7 describe the v0.1.0 build, with the Phase 9 results added.

Date: 2026-11-10. Built against Claude Code 2.1.319–2.1.321. Inputs: `docs/implementation-prompt.md` and `docs/architecture.md`.

## 1. What was built

A Claude Code plugin (`factory`) distributed through a marketplace in this repository. It classifies a development request and runs it as a **QUICK**, **STANDARD** or **FULL-SPEC** workflow. State is deterministic and validated in `.factory/`. Work is delegated to specialised subagents, reviewed independently, and kept safe by guards while a workflow runs.

| Architecture concept (architecture.md) | Physical implementation | Decision |
|---|---|---|
| Kit, installer | Plugin + marketplace; `/factory:init` with `factory-install` and a receipt | ADR-0001, ADR-0010 |
| Deterministic core | `plugins/factory/lib/*.mjs`, zero-dependency Node ≥ 18, exposed as `bin/factory-state` | ADR-0002 |
| Orchestrator | The main conversation, driven by `skills/start` and `skills/resume` and the playbooks in `core/workflows/` (served by `factory-state guide`) | ADR-0003 |
| Classifier | A 10-dimension rubric scored by the model; total, mode and overrides computed by `lib/classify.mjs` | — |
| Workflow state, artifacts | `.factory/workflows/<id>/manifest.json` + markdown artifacts; `factory-state` is the only writer | ADR-0008, ADR-0009 |
| Workers, reviewers | 6 plugin agents; models routed through per-call aliases from config | ADR-0004 |
| DAG, parallelism | Task DAG validation, ready set, scheduling by non-overlapping file scopes | ADR-0007 |
| Bounded review loop | At most 3 rounds, then escalation; independence enforced on completion | — |
| Discovery provider | `/grill-with-docs`, typed by the user, verified by evidence; native fallback | ADR-0005 |
| Specification provider | Local templates, or Spec Kit 1.x (specify, clarify, plan) with Factory supplements; completeness check | ADR-0006 |
| Hooks | Resume notice, command and file guards, config and manifest validation, optional formatter; inert outside workflows | ADR-0011 |

Contracts: `docs/contracts/`. Guides: `docs/guide/`.

## 2. Components

| Component | Files |
|---|---|
| Entry skills | `skills/start`, `skills/resume`, `skills/init` (all user-invoked only) |
| Agents | `frontend-worker`, `backend-worker`, `qa-worker`, `devops-worker` (Sonnet); `code-reviewer`, `architecture-reviewer` (Opus) |
| CLIs | `factory-state` (state, guides, checks, providers), `factory-install` (repository integration) |
| Core library | `schema`, `contracts`, `glob`, `classify`, `state`, `store`, `providers`, `spec`, `hooks`, `hook-main`, `installer` |
| Runtime docs | `core/operating-rules.md`, `core/rubric.md`, 8 workflow procedures, 9 templates, worker and reviewer contracts |
| Schemas, defaults | 8 JSON Schemas (`core/schemas/`), `core/defaults.json` |
| Hooks | `hooks/hooks.json`, `hooks/factory-hook.mjs` |
| Evals | `evals/`: 5 cases, a shared fixture |

## 3. Installation and use

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

```text
/factory:init                # optional: config, .gitignore, the two allow rules, rules file
/factory:start <request>
/factory:resume [ID] [answer]
```

Details: [installation](guide/installation.md), [usage](guide/usage.md), [configuration](guide/configuration.md).

## 4. Testing performed

| Level | Result |
|---|---|
| Deterministic (`npm test`) | 139/139 pass: core logic, CLIs against an installed copy, hooks with synthetic payloads, installer, plugin structure |
| `claude plugin validate .` | passes |
| Behavioural evals, smoke (hooks) | 3/3 cases, 6/6 runs pass (Sonnet, Haiku judge, $0.29) |
| Behavioural evals that need `bin/` | blocked by the eval harness: plugin `bin/` is not on PATH under `claude plugin eval` 2.1.321 |
| Real sessions (Phases 4–6) | QUICK, STANDARD (parallel, recovery), review loop with a planted defect, and FULL-SPEC with `/grill-with-docs` and Spec Kit: each end to end, single runs, about $17 for the full FULL-SPEC run |
| Real project (Phase 9) | FULL-SPEC on an existing Go + templ + HTMX + SQLite app (authentication and authorization): local spec provider, frontend worker, a plan review loop, a guard denial resolved through the user; $7.99. The result was checked independently by running the app. Three defects found and fixed in 0.1.1 ([log](research/phase-9-real-project.md)) |
| Real project, STANDARD (Phase 9) | Password recovery on the same app: classified FULL-SPEC as first worded (correctly), then STANDARD once the decisions were stated; 4 tasks, 2 reviews, all first-attempt; $4.88. Checked independently. Fixes in 0.1.2: `cancelled` status, no `git -C`, plain read-only snapshot |
| Provider comparison (Phase 10) | The same real GitHub issue on a second real project (Go, PostgreSQL, Redis, Spec Kit in use), run as FULL-SPEC twice: with `/grill-with-docs` and Spec Kit ($24.33) and with the native and local providers ($12.94). Both were correct when checked in a real browser against the database. Four kit defects were fixed in 0.2.1-beta ([log](research/phase-10-provider-comparison.md)) |
| Real project, QUICK (Phase 9) | Password visibility toggle: QUICK (score 3), main-thread implementation, disclosed scope extension, paused for a CSS rebuild; $1.12. Checked in headless Chromium. Fix in 0.1.3: tool-use and entry-point rules for the orchestrator |

**Not yet exercised in a real session:**
- an escalation;
- failure → retry → replan;
- the native discovery fallback, or `/grill-with-docs` unavailable;
- the devops worker;
- `/factory:init` (only unit tests and a partial eval);
- a hook deny under `bypassPermissions`;
- a team rollout through `extraKnownMarketplaces`.

See [testing](guide/testing.md).

## 5. Integration status

| Integration | Status |
|---|---|
| Claude Code plugin system | Working (installed and as a dev directory) |
| `/grill-with-docs` (mattpocock/skills) | Detected in project, user and plugin scope; used for real in FULL-SPEC; needs the user to type it |
| GitHub Spec Kit 1.0.1 | Detected; `speckit-specify` used for real; `clarify` and `plan` follow the same contract; other major versions are refused |
| Subagent worktrees | Probed; not supported in v0.1 (base and merge semantics) |
| `claude plugin eval` | Works for hook-level behaviour; blocked for workflow-level cases (see above) |

## 6. Limitations

See [security and limitations](guide/security.md). In short:
- **The guards are not a sandbox,** and they fail open.
- **Parallel workers share one checkout.**
- **Discovery pauses for the user.**
- **Models are routed by alias only,** and organisation policy can override them.
- **The evidence comes from single runs and a small eval suite.**
- **FULL-SPEC is expensive.**

## 7. Recommended next steps

1. Run the `needs-bin` evals once `claude plugin eval` exposes plugin `bin/` (or run them through an installed plugin in CI). Then add cases for escalation, retry and replan, and the native discovery fallback.
2. Run `/factory:init` in a real session on an existing project, and do a team rollout with `extraKnownMarketplaces`.
3. Verify the hook `deny` under `bypassPermissions`, and document the result.
4. ~~Publish the marketplace to a git host~~: done, at [github.com/leoarkiteto/ai-software-factory-kit](https://github.com/leoarkiteto/ai-software-factory-kit).
5. Consider worktree isolation (ADR-0007) once base and merge semantics are documented.
6. Measure: repeated runs per mode with costs, to calibrate the rubric thresholds and the model tiers.

## 8. Release status: beta and the 1.0 criteria

**Beta (0.2.x)** means:
- the kit is fit for daily use by someone who watches what it does;
- it is not yet a stable tool to hand to a team.

**Evidence for beta.** Phase 9 ([log](research/phase-9-real-project.md)) ran all three modes on a real project with real requests, plus one STANDARD workflow run by the user alone:
- the classifier was right in every case, including moving a vague request up to FULL-SPEC and a fully specified one down to STANDARD;
- each result was checked independently: tests, `curl`, and a real browser;
- no worker worked around a guard, and the final reports stated what was not verified.

**Why not 1.0.**
- Every Phase 9 run still found new kit defects (3, 3, 2 and 1). They are fixed in 0.1.1–0.1.4, but the rate has not reached zero.
- The 0.1.2–0.1.4 fixes change agent instructions, which unit tests do not exercise.
- Important paths have never run in a real session.
- The sample is one project in one stack (Go), single runs, and one user.

### Criteria for 1.0

Each item needs evidence in `docs/research/`: a session log with costs, and transcript audits for the instruction-level items.

- [ ] **Five consecutive real workflows with no new kit defect,** across all three modes. At least one must be on a TypeScript/React project, and at least one on a monorepo.
- [ ] **Failure paths exercised on purpose:**
  - an escalation after `review.maxIterations` rounds, using a planted defect, as in Phase 5;
  - a task failure followed by retry, then replan.
- [ ] **The 0.1.2–0.1.4 instruction fixes confirmed in transcripts.** *Partly confirmed in Phase 10: no `git -C`, no subagent denials, follow-up issues recorded. Not confirmed: the orchestrator still wrapped validation commands in pipes, which led to the stricter rule in 0.2.1-beta.*
  - reviewers run `git` without `-C`;
  - the read-only snapshot is a plain `git status --porcelain`;
  - the orchestrator writes code with Write/Edit and uses the project's own targets;
  - non-required review findings are recorded as issues, and the final report carries the follow-up request;
  - `cancelled` is used only at the user's request.
- [ ] **The remaining real-session gaps covered:**
  - the devops worker;
  - `/factory:init` run interactively;
  - a hook deny under `bypassPermissions`;
  - a repository without git (supported, or refused with a clear message).
- [ ] **Someone other than the author installs and uses the kit** from the README and guides alone, including a team rollout through `extraKnownMarketplaces`. Every point where they get stuck is fixed in the docs.

When all items are checked, release 1.0.0. Any new kit defect found along the way resets the five-run count.

**Five-run count: 0.** Phase 10 found new kit defects (fixed in 0.2.1-beta), so the count starts again from the next real workflow.

