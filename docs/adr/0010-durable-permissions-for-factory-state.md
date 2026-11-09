---
status: accepted
---
# The Factory needs two durable allow rules, which the user adds through `init` with explicit approval

A skill's `allowed-tools` pre-authorise tools only during the skill's invoking turn. In a real STANDARD run on Claude Code 2.1.319, `Bash(factory-state *)` and `Edit(/.factory/**)` worked until the delegated workers returned. After that, the orchestrator's next `factory-state` call and its inbox write were both denied. The orchestrator correctly stopped instead of working around the denial. A workflow that delegates therefore needs the two rules **in settings**: `Bash(factory-state *)` and `Edit(/.factory/**)`. Both are narrow: the CLI only writes validated state under `.factory/`, and the edit rule covers only that directory. `/factory:init` proposes them for `.claude/settings.json` or `.claude/settings.local.json`, and the user approves them explicitly. Without them, Claude Code prompts for each call, and approving with "don't ask again" has the same effect.

## Considered Options

- A plugin PreToolUse hook that returns `permissionDecision: "allow"` for these calls. Rejected: a plugin that grants itself permissions silently is less transparent than a visible settings entry. The interaction with users' deny rules would also need separate verification.
- Avoiding the calls after delegation. Not possible: recording results is the point.
