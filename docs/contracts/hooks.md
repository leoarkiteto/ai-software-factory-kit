# Hooks

The plugin declares its hooks in `plugins/factory/hooks/hooks.json`. Each one runs `node "${CLAUDE_PLUGIN_ROOT}/hooks/factory-hook.mjs" <event>`. The logic lives in `lib/hooks.mjs` (pure rules) and `lib/hook-main.mjs` (the dispatcher). Both are tested with synthetic payloads in `tests/hooks.test.mjs`.

## 1. Inert by default

Plugin hooks fire in **every** session that has the plugin enabled, so:

1. **No `.factory/` directory: every hook exits 0 with no output.** The hook looks for `.factory/` from the payload's `cwd` upwards, then from `$CLAUDE_PROJECT_DIR`. In repositories without it, this probe is the only cost (about 40 ms per call).
2. **`.factory/` exists but no workflow is active** (every workflow `completed` or `failed`): the session notice and the guards stay silent. Only the validation of the Factory's own files runs (§4).
3. **An active workflow exists:** the guards apply to every matching tool call in the session, including calls made by subagents. Hooks fire inside subagents, and a subagent's payload carries `agent_id` and `agent_type`.

Every handler **fails open**. An internal error turns into a `systemMessage` visible to the user, and the tool call goes ahead. A broken guard must not block every session that has the plugin enabled. See ADR-0011.

## 2. SessionStart: the resume notice

- **Matcher:** `startup|resume|clear|compact`.
- **Toggle:** `hooks.sessionResume`.
- **Behaviour:** when active or broken workflows exist, the hook prints one line per workflow (summary and next action, at most 5), plus one line per invalid manifest. On exit 0, Claude Code adds this plain stdout to the context.
- **Policy:** the notice tells Claude **not** to resume automatically. Resuming is the user's decision (`/factory:resume [ID]`).

## 3. PreToolUse: the guards

- **Matcher:** `Bash|Read|Edit|Write|MultiEdit|NotebookEdit`.
- **Output:** a denial is the documented JSON on exit 0:

  ```json
  {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "Factory guard: …"}}
  ```

  The reason tells Claude to stop and ask the user rather than work around the block. Calls the guard does not object to produce no output, so Claude Code's normal permission flow decides. The hook never returns `allow`.

| Guard | Toggle | Applies to | Denies |
|---|---|---|---|
| Command guard | `hooks.commandGuard` | `Bash` | The rules in §3.1 |
| Protected paths | `hooks.commandGuard` | `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, and path arguments of `Bash` commands | Paths that match `security.protectedPaths` (default `.env`, `.env.*`, `**/*.pem`, `**/*.key`, `**/secrets/**`, `**/credentials*`). `.env.example`, `.sample`, `.template`, `.dist` and `.defaults` stay readable. Paths outside the repository are left to Claude Code's permissions |
| Manifest writes | `hooks.manifestValidation` | `Edit`, `Write`, `MultiEdit`, and `Bash` redirections or write commands (`tee`, `cp`, `mv`, `sed -i`, …) | Direct writes to `.factory/workflows/*/manifest.json`. `factory-state` is the only writer. Reads are allowed |

### 3.1 Command guard rules

The command is split into simple commands on `&&`, `||`, `;`, `|`, `&`, newlines and parentheses, outside quotes. The guard also looks inside `$(…)`, backticks, `sh -c` / `bash -c` / `zsh -c` and `eval`. It removes leading `VAR=value`, `env`, `command`, `nohup`, `time` and `exec`. Rules are anchored at the start of each simple command, so a mention inside a quoted argument does not trigger them: `git commit -m "never git push"` is allowed. Here-document bodies (`<<EOF`, `<<-EOF`, `<<'EOF'`) are data, not commands: `cat > README.md <<EOF` with a line `git push` is allowed. The bodies are analysed as commands only when some part of the command runs a shell (`bash <<EOF`, `cat <<EOF | sh`, `ssh host <<EOF`, `source`, `eval`).

| Category | Examples denied | Still allowed |
|---|---|---|
| Publishing commits | `git push …`, `git -C dir push`. With `security.allowGitPush: true`, plain pushes are allowed, but `--force`, `-f`, `--force-with-lease`, `+ref`, `--mirror` and `--delete` stay denied | `git commit`, `git status`, `git diff` |
| Discarding work | `git reset --hard`, `git clean -f…`, `git checkout .`, `git checkout -- .`, `git restore .`, `git branch -D`, `git stash drop` / `clear`, `filter-branch`, `filter-repo`, `reflog expire` | `git checkout -b x`, `git restore --staged f`, `git branch -d`, `git stash` / `pop` |
| Dangerous `rm` | `rm` on `/`, `~`, `$HOME`, `.`, `..`, `*`, a top-level directory (recursive), `.git` or `.factory` | `rm -rf node_modules dist`, `rm src/old.ts` |
| Privilege | `sudo …` | — |
| Packages | `npm` / `yarn` / `pnpm` / `bun publish`, `cargo publish`, `twine upload`, `gem push`, `poetry publish`, `mvn deploy`, `gradle publish` | `npm test`, `npm run build` |
| Containers and clusters | `docker` / `podman push`; `kubectl apply` / `create` / `delete` / `patch` / `scale` / `rollout` / …; `helm install` / `upgrade` / `uninstall` / `rollback` | `docker build`, `kubectl get`, `helm template` |
| Infrastructure and cloud | `terraform` / `tofu apply` / `destroy` / `import` / `state rm`; `pulumi up` / `destroy`; `vercel`, `netlify`, `fly`, `firebase`, `serverless`, `cdk`, `wrangler`, … `deploy`; `vercel --prod`; `heroku …`; `gcloud … deploy` / `delete` / `create` / `update`; mutating `aws` and `az` commands; `aws s3 rm` / `rb` / `sync` / `mv` / `cp` | `terraform plan`, `aws s3 ls`, `gcloud config list` |
| Databases | `dropdb`, `dropuser`; `DROP DATABASE` / `SCHEMA` / `TABLE` or `TRUNCATE` anywhere in a command that invokes a database client (`psql`, `mysql`, `mariadb`, `sqlite3`, `duckdb`, `sqlcmd`, `sqlplus`, `clickhouse`, `cockroach`, `bq`, …), heredoc bodies and pipes included | `psql -c 'SELECT …'`, `grep -rn 'DROP TABLE' src`, writing a migration file that contains `DROP TABLE`, `truncate app.log` |
| Disks and permissions | `mkfs`, `fdisk`, `diskutil erase`, `shred`, `dd of=/dev/…`, `chmod 777` / `a+rwx` | — |
| Remote scripts | `curl … \| sh`, `wget … \| bash` | `curl -o file …` |
| Repository rules | Any regex in `security.blockedCommands`, matched against each simple command. Invalid patterns are ignored | — |

`factory-state` commands are never blocked.

## 4. PostToolUse: validation and optional formatting

- **Matcher:** `Edit|Write|MultiEdit`.
- **`.factory/config.json`** (`hooks.manifestValidation`; runs whenever `.factory/` exists): if the edited config fails the schema or the semantic checks, the hook returns `{"decision": "block", "reason": …}`. The edit has already happened; the block tells Claude that the Factory now falls back to defaults and what to fix.
- **`.factory/workflows/*/manifest.json`** (`hooks.manifestValidation`): a manifest that is invalid after an edit is reported the same way, with instructions to restore it. This matters only when the PreToolUse manifest guard is off or was bypassed.
- **Post-edit format** (`hooks.postEditFormat`, **off by default**): only while a workflow is active, and only for files outside `.factory/`.
  - The hook runs `validation.commands.format` from the repository root, with a 60-second timeout.
  - A `{file}` placeholder in the command is replaced by the shell-quoted repo-relative path, for example `"npx prettier --write {file}"`. Without the placeholder the command runs as written.
  - A failure is returned as `additionalContext`, which does not block anything. Success is silent.

## 5. Not hooked, and why

| Event | Reason |
|---|---|
| `Stop`, `SubagentStop` | Workflow completion is enforced by `factory-state` transition guards, and worker and review reports by `factory-state report` / `review`. A stop hook that blocks could loop (Claude Code caps consecutive continuations). Nothing needs it in v0.1 |
| `UserPromptSubmit` | Nothing to add: slash commands already route to the skills |
| `PermissionRequest` | The Factory does not grant permissions (ADR-0010) |

## 6. Limits

- **Not a sandbox.** The guard reads command text with a heuristic tokenizer. It cannot see what a script, a Makefile target, an npm script or an interpreter (`python -c`, `node -e`) does. It is a safety net against mistakes in workflow sessions, not a defence against a determined adversary. The security boundary is Claude Code's permission system: put hard limits in `permissions.deny` (`/factory:init` proposes deny entries; see installation.md).
- **Only during workflows.** Outside an active workflow the guards do nothing by design.
- **Runtime behaviour.** The output format and exit codes follow the hooks reference, checked on 2026-11-10. The unit and entry-point tests use synthetic payloads. Whether a hook `deny` holds in every permission mode (for example `bypassPermissions`) has not been verified in a live session; see `docs/research/claude-code-capabilities.md`.
- **The user stays in control.** The user can run a blocked command in their own terminal, turn a guard off in `.factory/config.json`, or set `security.allowGitPush`.
