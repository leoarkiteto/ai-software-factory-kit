---
status: accepted
---
# Workflow guards deny rather than ask, act only during workflows, and fail open

The plugin's PreToolUse guards (docs/contracts/hooks.md) return `permissionDecision: "deny"` for destructive, publishing and deployment commands, for protected paths, and for direct manifest writes. They do this only while a Factory workflow is active. On an internal error they let the call through with a visible `systemMessage`.

- **Deny, not ask.** Workers run as subagents, often several in parallel. A prompt raised from inside a delegated task is easy to approve without context. A denial returns a reason to the model, which must stop and report. The user can still run the command in their own terminal, or relax the policy in `.factory/config.json` (`security.allowGitPush`, `hooks.commandGuard`).
- **Only during workflows.** Plugin hooks fire in every session with the plugin enabled. Blocking `git push` in a user's ordinary session would be overreach.
- **Fail open.** A crashing guard that failed closed would block every tool call in every such session. The hooks are a safety net, not the security boundary: hard limits belong in `permissions.deny`, which `/factory:init` proposes.

## Considered Options

- `ask` for push and deploy. Rejected for the reason above. It could become a per-rule option later if users want it.
- Fail closed. Rejected: the cost of a guard bug would fall on every session, not only workflow sessions.
- A Bash parser dependency for exact command analysis. Rejected by ADR-0002 (zero dependencies). The heuristic tokenizer is documented as best-effort.
