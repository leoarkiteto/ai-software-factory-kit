# Usage

For worked examples with every command you type, see [use cases](use-cases.md) and the [monorepo walkthrough](monorepo-walkthrough.md).

## Start a workflow

```text
/factory:start <development request>
/factory:start --mode standard <request>     # force a mode; the reason is recorded
```

1. The orchestrator (Claude, in your main conversation) creates a workflow in `.factory/workflows/<id>/`.
2. It inspects the relevant code and scores ten rubric dimensions (0-2 each, with evidence).
3. `factory-state classify` computes the mode:
   - QUICK below 5;
   - STANDARD from 5;
   - FULL-SPEC from 12, or whenever `architecturalImpact` scores 2.
4. You see the mode and its reason. If confidence is low, you are asked to confirm it.

The slash command must be at the **start** of your message. Otherwise no skill runs.

## The three modes

| Mode | Flow | Reviews (default) |
|---|---|---|
| QUICK | implement → validate → report | code review only if a risk dimension scored 2 |
| STANDARD | plan (`plan.md`, task DAG) → workers in parallel where their file scopes do not overlap → validate → review → rework (at most 3 rounds) → integrate → final validation → report | code review always; architecture review on risk |
| FULL-SPEC | discovery → specification → plan → architecture review of the plan → STANDARD execution against the spec's requirement IDs | code and architecture reviews always |

**Workers** run as subagents with a brief that lists their files, acceptance criteria and validation commands:
- `factory:frontend-worker`;
- `factory:backend-worker`;
- `factory:qa-worker`;
- `factory:devops-worker` (never deploys).

They default to Sonnet. **Reviewers** (`factory:code-reviewer`, `factory:architecture-reviewer`) default to Opus and never review their own work. Change the models in [configuration](configuration.md).

## Pausing and resuming

A workflow stops and tells you exactly what it needs when:
- it needs your answer or approval;
- it needs a discovery session;
- an external dependency is missing;
- review rounds are exhausted (escalation).

The wait is recorded as `blockedOn` in the manifest.

```text
/factory:resume                                   # the only active workflow
/factory:resume wf-20261110-order-filters yes, use the existing API
```

- Resume works in a new session, because the state lives in files, not in the conversation.
- Interrupted tasks (`running` when a session ended) are checked against `git status` / `git diff` before being retried.
- At session start, a hook lists unfinished workflows. Claude mentions them but does not resume on its own.
- **To abandon a workflow,** for example to restate the request differently, ask Claude to cancel it, or run `factory-state transition <id> cancelled --reason "…" --user-approved`. Cancelled workflows are final and are no longer listed as active. Code already changed stays in the working tree.

## FULL-SPEC: discovery and specification

- **Discovery.** With `/grill-with-docs` installed, the workflow pauses and asks you to type `/grill-with-docs` (only you can start that skill). Answer its questions until it ends, then run `/factory:resume`.
  - The Factory checks the evidence: changes to `GLOSSARY.md` and ADRs since the workflow began, plus a `discovery-summary.md` with no blocking questions.
  - Without the skill, `discovery.whenUnavailable` decides: `ask` (default), `native` (the orchestrator interviews you itself) or `stop`.
- **Specification.**
  - With Spec Kit 1.x initialised, the workflow uses `speckit-specify`, `speckit-clarify` and `speckit-plan`. The Factory adds scope, NFRs and an acceptance-criteria mapping in `plan.md`.
  - Otherwise it uses its local template (`spec.md` with `FR-n`, `NFR-n` and `AC-n` IDs).
  - Either way, `factory-state spec-check` must pass before planning, and every functional requirement must be covered by a task.

## What you get at the end

`.factory/workflows/<id>/final-report.md`, which covers:
- what changed, file by file;
- the validation results: each command as passed, failed, or skipped with its reason. "Not configured" is never shown as passed;
- the review outcomes, and whether each review was independent;
- open issues with their severity;
- anything the orchestrator had to do itself.

The workflow never commits, pushes or deploys. It tells you what is ready and leaves it to you.

## Inspecting state yourself

These are read-only, inside Claude Code or from a terminal via `<plugin>/bin/factory-state`:

```bash
factory-state list                  # all workflows
factory-state show [ID]             # summary + next action
factory-state validate [ID]         # manifest and config validity
factory-state config                # effective configuration
factory-state providers             # /grill-with-docs and Spec Kit detection
```

Never edit `manifest.json` by hand. The guard hook blocks it during workflows, and `factory-state` refuses to load an invalid manifest.
