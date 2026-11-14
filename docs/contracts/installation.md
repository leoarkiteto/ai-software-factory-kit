# Contract: Installation, Update and Removal

Schema: `install-receipt.schema.json`. Decision record: ADR-0001. Implementation: the `factory:init` skill, the `factory-install` CLI (`bin/`) and `lib/installer.mjs`, tested in `tests/installer.test.mjs`. User guide: [docs/guide/installation.md](../guide/installation.md).

Approval binding: `factory-install plan` prints a hash of everything it would write. `apply` recomputes the plan from the same choices and refuses on a mismatch, so what runs is exactly what the user approved. `remove` works the same way.

## 1. Two layers

| Layer | How it gets installed | Who owns it |
|---|---|---|
| **Plugin** (skills, agents, hooks, `bin/`, schemas, templates) | `claude plugin marketplace add <this repo>` + `claude plugin install factory@<marketplace>` | Claude Code's plugin manager. Updates and removal are native. Nothing is written into the target repo |
| **Repository integration** (optional, per repo) | `/factory:init` | The Factory, tracked in `.factory/install.json` |

The plugin works without `init`. It falls back to the defaults and creates `.factory/workflows/` on the first workflow, after telling the user. `init` exists to tailor config and to optionally add rules and permissions.

## 2. Repository components

| Component | Path | Ownership | Default |
|---|---|---|---|
| `config` | `.factory/config.json` | whole file | proposed |
| `gitignore-block` | `.gitignore` | marked block | proposed when `artifacts.commitWorkflows` is false |
| `rules` | `.claude/rules/factory-workflow.md` | whole file | optional |
| `claude-md-block` | `CLAUDE.md` | marked block | **off**; the rules file is preferred because it needs no edit to `CLAUDE.md` |
| `settings-permissions` | `.claude/settings.json` (or `.local.json`, user's choice) | specific array entries: **allow** `Bash(factory-state *)` and `Edit(/.factory/**)` (needed for delegated workflows, ADR-0010), plus optional **deny** entries for protected paths and push/deploy | proposed (allow), optional (deny) |
| `discovery-permissions` | same settings file as `settings-permissions` | one **allow** entry, `Read(~/.claude/skills/domain-modeling/**)`, so `/grill-with-docs` reads `GLOSSARY-FORMAT.md` and `ADR-FORMAT.md` without a prompt. Only when that skill is in user scope; a project-scope skill needs no rule, and a plugin install is skipped with a note | optional |

Marked blocks use comment delimiters:

- in Markdown, `<!-- factory:begin v1 -->` … `<!-- factory:end -->` (Claude Code strips HTML block comments before injection, so the markers cost no context);
- in `.gitignore`, `# factory:begin v1` … `# factory:end`.

JSON settings get no markers. The receipt records exactly which array entries were added (`permissions.allow` and/or `permissions.deny`).

## 3. Procedure (`/factory:init`)

1. **Inspect, read-only.** Git state, language and tooling, candidate validation commands, `CLAUDE.md`/`.claude/` contents, existing skills and agents (names that collide with Factory roles), `.specify/`, `GLOSSARY.md`, `docs/adr/`, an existing `.factory/`.
2. **Detect conflicts:**
   - a target path exists but is not in the receipt (unknown ownership);
   - a receipt entry's current hash differs from the recorded `sha256` (user-modified);
   - malformed JSON in `.claude/settings.json`;
   - repo agents with the same name as a configured role agent.
3. **Plan.** Present a table: component · path · action (`create`, `insert block`, `add entries`, `update`, `skip`) · reason, plus a diff preview for every edited file.
4. **Approve.** The user approves components individually. Nothing is written before approval. Conflicts default to `skip`.
5. **Apply.** Writes are atomic per file (write to a temp file, then rename). JSON is edited structurally, never with text replacement. Unrelated keys and formatting are preserved where possible.
6. **Validate.**
   - The config passes `resolveConfig`.
   - Rules files parse.
   - Settings JSON parses, and the added deny entries are present.
   - `claude plugin validate` runs, if available.
   - Probe hooks with a synthetic payload: they must be silent outside a workflow.
7. **Report.** List what was written, what was skipped and why, and how to undo it. Write or refresh `.factory/install.json`.

## 4. Update

Re-running `init` after a plugin update compares the receipt against the files on disk:

| State | Action |
|---|---|
| Hash matches and the kit template changed | Propose an update (diff shown) |
| Hash differs (user edited) | Show a three-way summary; default `skip`; never overwrite silently |
| File missing | Propose re-create, or drop it from the receipt |
| Receipt entry for a component no longer shipped | Propose removal |

## 5. Removal (`/factory:init --remove`)

- Removes only receipt entries whose hash still matches.
- Removes marked blocks and their markers, and `permissions.deny` entries listed in `addedEntries`.
- Leaves `.factory/workflows/` alone unless the user explicitly asks.
- Modified entries are listed for manual handling.
- Uninstalling the plugin itself is `claude plugin uninstall factory`.

## 6. Never

The installer never:

- overwrites or reformats a file it does not own;
- deletes user content;
- edits `~/.claude/` (user scope);
- installs third-party skills or plugins on its own (it prints the command instead);
- runs `specify init`;
- adds any `permissions.allow` entry other than the two Factory rules from ADR-0010. Those two are shown verbatim and approved individually.
