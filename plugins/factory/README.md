# factory: AI Software Factory plugin for Claude Code

Classifies development requests into **QUICK**, **STANDARD** or **FULL-SPEC** workflows and runs them with tracked, validated state in `.factory/` inside your repository.

- `/factory:start <request>`: classify the request and run the matching workflow (`--mode` to force one).
- `/factory:resume [workflow-id] [answer]`: continue a paused or interrupted workflow.

Requires Node.js ≥ 18 (deterministic state tooling, exposed as `factory-state` on the Bash `PATH`). Full documentation, contracts and design decisions live in the kit repository under `docs/`.

## Permissions

Workflows that delegate to workers need two allow rules in your project settings, because skill-level pre-approval ends once subagents return (ADR-0010):

```json
{ "permissions": { "allow": ["Bash(factory-state *)", "Edit(/.factory/**)"] } }
```

`factory-state` only writes validated workflow state under `.factory/`. Without these rules, Claude Code asks each time.

Status: v0.1.0 pre-release. QUICK and STANDARD are usable end to end: planning, parallel delegated execution, independent review and bounded rework. FULL-SPEC discovery and specification procedures are not implemented yet; workflows stop with an explicit message when they reach them.
