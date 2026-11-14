# factory: AI Software Factory plugin for Claude Code

Classifies development requests into **QUICK**, **STANDARD** or **FULL-SPEC** workflows and runs them with tracked, validated state in `.factory/` inside your repository.

Install from GitHub (or pass the path of a local clone to `marketplace add`):

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

- `/factory:init`: optional per-repository setup (config, `.gitignore`, permissions, rules). It writes only what you approve, and `--remove` undoes it.
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
- `/grill-with-docs` reads its format files from where it is installed (for example `~/.claude/skills/domain-modeling/`), and writes `GLOSSARY.md` and `docs/adr/`. For a user-scope install, `/factory:init` offers the optional `discovery-permissions` component, which adds `Read(~/.claude/skills/domain-modeling/**)`.
- Spec Kit's `speckit-specify` writes `specs/` and `.specify/feature.json`.

## Safety hooks

While a workflow is active, the plugin's hooks deny the following in the main session and in workers, with a reason the model has to report:
- `git push` (unless `security.allowGitPush` is set; force pushes are always denied);
- destructive git and `rm` commands, `sudo`;
- package publishing, container pushes, deployments, and cluster or infrastructure changes;
- destructive database statements;
- files that match `security.protectedPaths` (`.env`, keys, `secrets/`, …);
- direct edits of workflow manifests.

Each new session also gets a short notice listing workflows that can be resumed. After an edit, the hooks validate `.factory/config.json` and the manifests. In repositories without `.factory/`, the hooks do nothing. Every hook can be switched off under `hooks` in `.factory/config.json`.

The guards are a best-effort safety net, not a sandbox. Put hard limits in `permissions.deny`. See `docs/contracts/hooks.md` and ADR-0011.

Status: v0.1.0 pre-release. All three modes are implemented and have each been exercised end to end in real sessions. A small behavioural eval suite lives in `evals/` (see the kit's docs/guide/testing.md).
