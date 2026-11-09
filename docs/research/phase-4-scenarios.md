# Phase 4: Real Scenario Runs

These were real headless Claude Code sessions (2.1.319), with the plugin loaded via `--plugin-dir`, against a fixture repository: a small Node project with `src/math.js`, `test/math.test.js`, and `.factory/config.json` setting `validation.commands.test = "npm test"`. They are **end-to-end runs, not mocks**. Model: session default (Opus).

| # | Scenario | Permission mode | Result | Turns | Cost (USD) | Denials |
|---|---|---|---|---|---|---|
| 1 | `/factory:start Fix the add function…` (bug: `a - b`) | acceptEdits | QUICK, completed; fix correct; tests 2/2 | 24 | 0.41 | 4 |
| 2 | same, after the operating-rules fix for compound commands | acceptEdits | completed; validation records fixed; still wrote temp files | 34 | 0.50 | 2 |
| 3 | same, after the inbox convention (ADR-0009) | **default** + `Edit(/src/**)` | completed; 0 stray files; manifest valid | 31 | 0.40 | **0** |
| 4 | `/factory:start --mode standard Add subtract and divide…` | default + `Edit(/src/**,/test/**)` | override recorded (rubric said QUICK); plan written; paused `blockedOn: user_approval`; no code changed | 20 | 0.34 | 0 |
| 5 | `/factory:resume Approved, go ahead.` in a **new session** | default | resumed from files; moved to `executing`; reached the Phase 5 placeholder, stopped, recorded `blockedOn: escalation`; offered an out-of-workflow alternative; no code changed | 8 | 0.18 | 0 |

## Defects found and fixed

1. **Compound Bash commands denied** (run 1). Operating rules now require one `factory-state` command per call.
2. **Unconfigured validations recorded as `command: "null"`** (run 1). The CLI rejects pseudo-commands and records `"<kind>: not configured"`.
3. **JSON heredocs denied, so the model improvised temp files** (runs 1–2). Fixed with the inbox convention (ADR-0009).

## Not covered yet

- Delegated execution, review, discovery and specification: placeholders until Phases 5–6.
- QUICK with risk, where review is triggered: needs the Phase 5 review procedure.
- Repeatability. Each scenario ran once and model behaviour can vary. Systematic behavioural evals are planned for Phase 8 (`claude plugin eval`).
