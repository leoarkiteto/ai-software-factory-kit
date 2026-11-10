# AI Software Factory Kit v0.1.0: final implementation report

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
claude plugin marketplace add /path/to/ai-software-factory-kit
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
| Deterministic (`npm test`) | 136/136 pass: core logic, CLIs against an installed copy, hooks with synthetic payloads, installer, plugin structure |
| `claude plugin validate .` | passes |
| Behavioural evals, smoke (hooks) | 3/3 cases, 6/6 runs pass (Sonnet, Haiku judge, $0.29) |
| Behavioural evals that need `bin/` | blocked by the eval harness: plugin `bin/` is not on PATH under `claude plugin eval` 2.1.321 |
| Real sessions (Phases 4–6) | QUICK, STANDARD (parallel, recovery), review loop with a planted defect, and FULL-SPEC with `/grill-with-docs` and Spec Kit: each end to end, single runs, about $17 for the full FULL-SPEC run |

**Not yet exercised in a real session:**
- an escalation;
- failure → retry → replan;
- the native discovery fallback, or `/grill-with-docs` unavailable;
- the local spec provider;
- the frontend and devops workers;
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
4. Publish the marketplace to a git host and replace `<owner>/<repo>` in the docs.
5. Consider worktree isolation (ADR-0007) once base and merge semantics are documented.
6. Measure: repeated runs per mode with costs, to calibrate the rubric thresholds and the model tiers.
