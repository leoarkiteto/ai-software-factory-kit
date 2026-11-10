---
name: init
description: Set up the AI Software Factory in this repository. Inspects it, proposes .factory/config.json, a .gitignore block, the two permission rules delegated workflows need, and optional rules, then writes only what the user approves. Also shows status and removes the integration.
argument-hint: "[--status | --remove]"
disable-model-invocation: true
allowed-tools: Bash(factory-install *) Read Grep Glob AskUserQuestion
---

# Factory: set up this repository

You install the Factory's **repository integration**. The plugin itself is already installed; this only adds per-repository files. Contract: `docs/contracts/installation.md` in the kit.

Arguments: $ARGUMENTS

## Current state

!`factory-install status 2>&1 || true`

## Rules

- **Nothing is written before the user approves the exact plan.** `factory-install plan` writes nothing. `factory-install apply` writes only the plan whose hash you pass, and refuses if anything changed since.
- Run one `factory-install` command per Bash call. Do not chain commands, and do not use `cd`.
- Never edit the target files yourself (no Edit or Write on `.factory/`, `.claude/`, `.gitignore`, `CLAUDE.md`). All writes go through `factory-install`.
- Show the permission rules **verbatim** and get explicit approval for them. They change what Claude Code may do without asking.
- Conflicts default to `skip`. Never pass options designed to overwrite the user's files; none exist.
- Never install third-party skills or plugins, never run `specify init`, never touch `~/.claude/`.

## `--status`

Run `factory-install status` and `factory-install verify`, report the result, and stop.

## `--remove`

1. Run `factory-install remove`. Show the plan as it is printed. Point out the entries kept because the user modified them, and say that `.factory/workflows/` is never removed.
2. Ask for approval. If the user approves, run `factory-install remove --apply --plan-hash <hash>`.
3. Report what was removed, and add: to uninstall the plugin itself, run `claude plugin uninstall factory`.

## Install or update (no arguments)

1. **Inspect.** Run `factory-install inspect`. Summarise what matters: git state, the validation command candidates and where they came from, existing settings, Spec Kit / GLOSSARY / ADRs, an existing `.factory/` or receipt.
2. **Ask** (one AskUserQuestion call, at most 4 questions):
   - **Components** (multi-select):
     - `config` (recommended);
     - `gitignore-block`: ignores `.factory/workflows/`; recommended unless the team wants to commit workflow history;
     - `settings-permissions` (recommended);
     - `rules`: `.claude/rules/factory-workflow.md`, optional;
     - `claude-md-block`: a short block in `CLAUDE.md`, optional; the rules file is preferred.
   - **Where the permission rules go:**
     - `.claude/settings.local.json`: personal and not committed (recommended);
     - `.claude/settings.json`: shared with the team through git.
   - **Optional deny rules:** `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`, `Read(./**/secrets/**)`, `Bash(git push *)`. These apply in **every** session, not only during workflows. `Read(./.env.*)` also blocks `.env.example`.
   - **Validation commands:** whether the detected candidates are right. Offer "use as detected", "none", and Other so the user can type corrections.
3. **Plan.** Run `factory-install plan` with the choices:
   - `--components a,b,...`;
   - `--settings local|shared`;
   - `--deny` if chosen;
   - `--test "CMD"` and the like for corrections, `--test none` to unset one;
   - `--no-detect` if the user wants no commands.

   Show the printed plan as it is, including its hash. State plainly that the plan adds these two allow rules, and why: "skill-level pre-approval ends when workers return, so recording results would otherwise prompt each time" (ADR-0010).
   - `Bash(factory-state *)`
   - `Edit(/.factory/**)`
4. **Approve.** Ask whether to apply exactly this plan. If the user wants changes, go back to step 3.
5. **Apply.** Run `factory-install apply --plan-hash <hash>` with **the same choices**. If it is rejected because the plan changed, show the new plan and ask again.
6. **Report.**
   - What was written and what was skipped, with the reasons.
   - The check results.
   - How to undo it: `/factory:init --remove`.
   - Next step: `/factory:start <request>`.
   - Two optional notes: suggest `git add .factory/config.json` (plus `.claude/settings.json` or the rules file if chosen), and do not commit unless asked. If the team should get the plugin automatically, point to the kit's installation docs (`extraKnownMarketplaces` / `enabledPlugins`).
