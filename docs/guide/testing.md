# Testing

The kit is tested at three levels. Each one says something different about whether it works.

## 1. Deterministic tests: `npm test`

- **What runs:** about 136 `node:test` tests with no dependencies, offline and free, in a few seconds.

| File | Covers |
|---|---|
| `tests/contracts.test.mjs` | schemas, config resolution, model routing, report checks |
| `tests/glob.test.mjs`, `tests/classify.test.mjs` | glob overlap, rubric and mode selection, review policy |
| `tests/state.test.mjs` | state machine per mode, guards, DAG, scheduling, retries, review loop |
| `tests/spec.test.mjs` | spec and discovery completeness (local and Spec Kit) |
| `tests/cli.test.mjs` | `factory-state` end to end against an installed copy of the plugin |
| `tests/hooks.test.mjs` | guard rules, inertness, toggles, validation hooks, the installed hook entry point, with synthetic payloads |
| `tests/installer.test.mjs` | inspect, plan, hash-bound apply, conflicts, idempotency, update, removal, `factory-install` CLI |
| `tests/plugin.test.mjs` | skill and agent frontmatter, guide references, no hard-coded plugin paths |
| `tests/evals.test.mjs` | eval suite structure and fixture sync |

Also run `claude plugin validate .` (manifest and marketplace) and `node scripts/sync-eval-fixtures.mjs --check`.

- **What these prove:** the deterministic core does what the contracts say.
- **What they do not prove:** how a model behaves when it follows the skills.

## 2. Behavioural evals: `claude plugin eval`

The suite lives in `plugins/factory/evals/`, one directory per case. Every case starts from the same scaffold, a tiny Node repository; some also get an active workflow. The fixture source is `evals/fixtures/scaffold.sh`. Copy it into each case with `node scripts/sync-eval-fixtures.mjs`, because scaffold scripts must live inside their case.

```bash
cd plugins/factory
claude plugin eval . --tag smoke --allow-tools Bash Read Glob Grep \
  --model sonnet --judge-model haiku --ablation none --scaffold --trust-plugin --max-cost-usd 1.5
```

| Case | Tag | Checks |
|---|---|---|
| `guard-blocks-push` | smoke | With an active workflow, `git push` is denied by "Factory guard", and the model reports it without working around it |
| `hooks-silent-without-workflow` | smoke | Without a workflow, the hooks never interfere, even with `git branch -D` |
| `session-notice-no-auto-resume` | smoke | The SessionStart notice reaches the model. It names the workflow and `/factory:resume`, and changes no state |
| `init-plan-before-writing` | needs-bin | `/factory:init` inspects and plans, writes nothing, and shows the allow rules verbatim |
| `quick-workflow-fix` | needs-bin | A real QUICK workflow fixes a bug, runs `npm test`, completes the workflow and reports honestly, without a commit |

**Results on 2026-11-10** (Claude Code 2.1.321, Sonnet with a Haiku judge, 2 runs per case):
- **smoke:** 3/3 cases and 6/6 runs passed, for $0.29.
- **needs-bin:** these cases cannot run under `claude plugin eval` today. In eval sessions, the plugin's `bin/` directory is not on the Bash PATH, though it is for an installed plugin. `factory-state` and `factory-install` are not found, and the model correctly stops without writing anything. The hooks are unaffected because they call `node "${CLAUDE_PLUGIN_ROOT}/…"`. Setting `env.PATH` in a scaffolded `.claude/settings.json` did not help. Run these cases again when the eval harness exposes plugin `bin/`.

## 3. Real-session scenarios

Phases 4 to 6 ran the plugin as installed, in headless `claude -p` sessions, against scratch repositories. Phase 9 ran it on a real project (a Go + templ + HTMX + SQLite app) for a real feature, Phase 10 compared providers on a second project, and Phase 11 ran it on a real monorepo (Expo/React Native + Go). The logs, with costs, are in `docs/research/`.

| Exercised for real | Only in deterministic tests so far |
|---|---|
| QUICK end to end in default permission mode with no denials | an escalation after 3 review rounds |
| STANDARD with parallel workers, an interrupted session and recovery | failure → retry → replan |
| A review loop with a planted defect: NEEDS_CHANGES → rework → APPROVED | the native discovery fallback; `/grill-with-docs` unavailable |
| FULL-SPEC: `/grill-with-docs` (2 rounds), Spec Kit spec, architecture plan review, QA worker, parallel code and architecture reviews | Spec Kit and the local provider in the same repository |
| FULL-SPEC on a real project: local spec provider, plan review NEEDS_CHANGES → APPROVED, frontend worker, a guard denial resolved through the user | |
| STANDARD on a real project: the classifier moving from FULL-SPEC to STANDARD when the decisions are stated in the request | |
| QUICK on a real project: main-thread implementation, a pause for user approval mid-execution, no review under `on_risk` | |
| FULL-SPEC with and without the providers on a second real project, recovery after usage-limit interruptions | |
| The guard, inertness and the resume notice (evals above) | the devops worker; `/factory:init` in a real session; a hook deny under `bypassPermissions` |

These were single runs. They show that the procedures can work end to end, not how often they do.

**Counting cost.** With `claude -p --resume`, the `total_cost_usd` and `modelUsage` fields of `--output-format json` are **cumulative for the session**, not for the invocation. The cost of a session is the value from its last invocation. Do not add up the values of one session. On a subscription plan this is an API-equivalent measure of quota use, not a charge.

**Counting denials.** The `permission_denials` field of `claude -p --output-format json` lists only the main session's denials. Denials inside subagents (workers and reviewers) are not in it. To audit a run, scan the subagent transcripts in `~/.claude/projects/<project>/<session>/subagents/*.jsonl` for tool results that are errors.
