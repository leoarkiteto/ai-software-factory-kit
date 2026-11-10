# AI Software Factory

This repository uses the AI Software Factory plugin (`factory`). These rules apply in every session.

- Development requests run through `/factory:start <request>`. The user types it; do not start a workflow on your own initiative.
- `/factory:resume [ID]` continues a paused or interrupted workflow. A session-start notice may list such workflows. Mention them, but resume only when the user asks.
- Workflow state lives in `.factory/workflows/<id>/manifest.json` and is changed **only** through `factory-state` commands. Never edit a manifest directly.
- `.factory/config.json` holds this repository's Factory settings (validation commands, review policy, hooks, protected paths). Check it with `factory-state config`.
- While a workflow is active, the Factory guard denies `git push`, deployments, destructive commands, protected paths and manifest edits. A denial that starts with "Factory guard" is final: do not work around it. Report it and ask the user.
