# QUICK Workflow

For small, isolated changes. **Minimal ceremony:** no spec, no plan document, and no delegation unless review is required.

Stages: `classifying → executing → [reviewing] → integrating → completed`

## 1. Focused analysis (still `classifying`)

- Read only what the change needs: the target code, its direct callers, and its tests.
- If the change turns out to be bigger than QUICK (more components, architectural impact, behaviour decisions needed), stop. Re-classify with the new evidence (`factory-state classify`), or tell the user and escalate (see "Escalation" below).

## 2. Define the single task

Write `.factory/workflows/<id>/inbox/tasks.json`:

```json
[{ "id": "T1", "title": "<imperative, ≤ 80 chars>", "role": "<closest worker role, e.g. backend-worker>",
   "dependsOn": [], "status": "pending",
   "scope": { "files": ["<paths or globs you will modify>"] },
   "acceptanceCriteria": ["<observable outcome 1>", "..."] }]
```

Then run each of these as a separate command:

```bash
factory-state tasks <id> --file .factory/workflows/<id>/inbox/tasks.json
factory-state transition <id> executing --reason "quick task defined: <title>"
factory-state task <id> T1 --status running --agent orchestrator --model null
```

## 3. Implement (main thread, no delegation)

- Make the change. Stay inside `scope.files`. If you must touch another file, update the scope through `replanning`, or note it in the final report as a scope deviation.
- Add or adjust tests when behaviour changes and the repository has tests for that area.

## 4. Validate

- Run the relevant configured commands (`factory-state config` → `validation.commands`), usually `test` and `lint`. Run each one as its own Bash call. For unconfigured kinds, you may run an obvious, safe, read-only test command (for example `npm test` when `package.json` defines it). Record whatever you run:
  `factory-state validation <id> --kind test --command "<cmd>" --status passed|failed --exit <code> --summary "<one line>"`
- If tests fail because of your change, fix and re-run. If they fail for unrelated, pre-existing reasons, record that in `--summary` and the final report. Do not "fix" unrelated tests.
- `factory-state task <id> T1 --status completed --result "<one line>"`

## 5. Review (only if required)

`factory-state next <id>` says `review` or `integrate`.

- **`review`** (the classification flagged risk): run `factory-state transition <id> reviewing --reason "..."`, then follow `${CLAUDE_PLUGIN_ROOT}/core/workflows/review.md`. You implemented the change, so the review must go to `factory:code-reviewer`. If that agent cannot be used (for example, a denied permission), stop and tell the user. Do not review your own work and call it independent.
- **`integrate`**: skip to step 6.

## 6. Integrate and finish

```bash
factory-state transition <id> integrating --reason "..."
```

- Run any `validation.final` commands that are configured and not yet run since the last change. Record them.
- Write `.factory/workflows/<id>/final-report.md` from `${CLAUDE_PLUGIN_ROOT}/core/templates/final-report.md`. Keep it short for QUICK.
- `factory-state artifact <id> finalReport .factory/workflows/<id>/final-report.md`
- `factory-state transition <id> completed --reason "<validation summary>"`
- Give the user a 3–6 line summary: what changed, files, validation results, anything not verified.

## Escalation

If QUICK proves insufficient after execution started:

```bash
factory-state transition <id> replanning --reason "<what was discovered>"
factory-state transition <id> planning --mode standard --reason "escalated: <why>"
```

Then continue with `${CLAUDE_PLUGIN_ROOT}/core/workflows/standard.md` from step 2. Tell the user first.
