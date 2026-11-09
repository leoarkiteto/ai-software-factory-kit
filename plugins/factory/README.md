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

`factory-state` only writes validated workflow state under `.factory/`, and also serves the plugin's procedures (`factory-state guide`). Without these rules, Claude Code asks each time.

Optional integrations need their own access:
- `/grill-with-docs` reads its format files from where it is installed (for example `~/.claude/skills/domain-modeling/`), and writes `GLOSSARY.md` and `docs/adr/`.
- Spec Kit's `speckit-specify` writes `specs/` and `.specify/feature.json`.

Status: v0.1.0 pre-release. All three modes are implemented. QUICK and STANDARD have been exercised end to end in real sessions. FULL-SPEC has been exercised through discovery (`/grill-with-docs`), specification (Spec Kit) and plan review; its execution and change-review stages use the same procedures as STANDARD.
