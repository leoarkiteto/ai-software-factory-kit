# Installation

The kit has two layers (contract: [installation.md](../contracts/installation.md)).

1. **The plugin.** Claude Code's plugin manager installs, updates and removes it. It writes nothing into your repositories.
2. **The repository integration** (optional, per repository). `/factory:init` adds it, with your approval for each file.

## 1. Install the plugin

```bash
claude plugin marketplace add /path/to/ai-software-factory-kit   # local clone
# or, once published:  claude plugin marketplace add <owner>/<repo>
claude plugin install factory@ai-software-factory-kit             # add --scope project to share it with the repository
```

Check it: `claude plugin list` shows `factory`, and `/factory:start` appears in the slash-command menu.

**Requirements:**
- Claude Code ≥ 2.1.319 (the version the kit was verified on). Evals need ≥ 2.1.269.
- Node.js ≥ 18 on `PATH`. The plugin's `bin/` tools and hooks run with `node`.

The plugin works without `init`: it uses the defaults and creates `.factory/workflows/` on the first workflow.

### Optional integrations

| Integration | Used for | Install |
|---|---|---|
| `/grill-with-docs` | FULL-SPEC discovery (domain questions, `GLOSSARY.md`, ADRs) | `claude plugin install mattpocock-skills@claude-plugins-official`, or `npx skills add mattpocock/skills` |
| GitHub Spec Kit 1.x | FULL-SPEC specification (`speckit-specify`, `clarify`, `plan`) | `specify init --here --integration claude` in the repository |

The Factory detects both (`factory-state providers`) and never installs them itself. Without them, FULL-SPEC uses its own discovery fallback and local spec templates.

## 2. Set up a repository: `/factory:init`

Run `/factory:init` inside Claude Code in the target repository. It:

1. **Inspects** the repository, read-only: git state, validation command candidates from `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml` and `go.mod`, existing settings and rules, Spec Kit, glossary and ADRs.
2. **Asks** which components you want and where the permission rules go.
3. **Shows a plan** with a preview of every change and a plan hash.
4. **Writes nothing until you approve.** It then applies exactly that plan (`factory-install apply --plan-hash …`, which refuses if anything changed since).
5. **Verifies:**
   - the config is valid;
   - the settings files parse;
   - the hooks are silent for a harmless command;
   - the receipt is valid.

| Component | File | Default |
|---|---|---|
| `config` | `.factory/config.json`: schema version plus the validation commands you confirmed | recommended |
| `gitignore-block` | marked block in `.gitignore` ignoring `.factory/workflows/` | recommended |
| `settings-permissions` | adds `Bash(factory-state *)` and `Edit(/.factory/**)` to `.claude/settings.local.json` (or `.claude/settings.json`) | recommended |
| `settings-permissions` with deny rules | adds `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`, `Read(./**/secrets/**)` and `Bash(git push *)` to `permissions.deny`. They apply in **every** session | optional |
| `rules` | `.claude/rules/factory-workflow.md`: short standing instructions | optional |
| `claude-md-block` | marked block in `CLAUDE.md` | optional; prefer `rules` |

**Why the allow rules.** A skill pre-approves its tools only for its own turn, and that approval ends once delegated workers return. Without the two rules, Claude Code asks every time the orchestrator records a result (ADR-0010). Both rules are narrow:
- `factory-state` only writes validated state under `.factory/`;
- the edit rule only covers `.factory/`.

What `init` records: `.factory/install.json`, a receipt with a hash of every file, block or set of entries it owns.

The same steps work from a shell:

```bash
factory-install inspect
factory-install plan --components config,gitignore-block,settings-permissions --test "npm test"
factory-install apply --plan-hash <hash> --components config,gitignore-block,settings-permissions --test "npm test"
factory-install status
```

(`factory-install` is on the `PATH` inside Claude Code. From a terminal, use `<plugin dir>/bin/factory-install`.)

## 3. Team rollout

Commit `.factory/config.json`, plus `.claude/settings.json` and `.claude/rules/factory-workflow.md` if you chose them. To offer the plugin to everyone who opens the repository, add this to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ai-software-factory-kit": { "source": { "source": "github", "repo": "<owner>/<repo>" } }
  },
  "enabledPlugins": { "factory@ai-software-factory-kit": true }
}
```

- The marketplace key is the `name` in `.claude-plugin/marketplace.json`.
- `extraKnownMarketplaces` takes effect after a collaborator accepts the folder trust dialog.
- Each collaborator still installs the plugin once: `claude plugin install factory@ai-software-factory-kit --scope project`.

These shapes come from the Claude Code docs as of 2026-11-10. The kit has not exercised a team rollout.

## 4. Update

- **Plugin:** `claude plugin update factory@ai-software-factory-kit` (or marketplace auto-update).
- **Repository integration:** run `/factory:init` again.
  - Unmodified Factory-owned content is updated when the kit's version changed. Missing files are offered for re-creation.
  - Anything you edited is reported as `user-modified` and left alone.

## 5. Removal

- `/factory:init --remove` (or `factory-install remove`) shows a removal plan, then deletes only intact Factory content:
  - whole files the Factory created;
  - its marked blocks;
  - the permission entries it added.

  Your edits, your own permission entries and `.factory/workflows/` stay.
- Then `claude plugin uninstall factory`.
