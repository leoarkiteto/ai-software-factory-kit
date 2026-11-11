# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Claude Code prompts for every `factory-state …` call or every write under `.factory/` after workers finish | A skill's pre-approval ends once subagents return (ADR-0010) | Run `/factory:init` and approve the two allow rules, or add `Bash(factory-state *)` and `Edit(/.factory/**)` to `permissions.allow` yourself |
| `factory-state: command not found` | The plugin is not enabled in this session, or you are in a plain terminal | Check `claude plugin list`. In a terminal, use `<plugin dir>/bin/factory-state` |
| `factory-state` fails with a syntax or import error | Node.js older than 18 | Install Node ≥ 18 |
| A command is denied with "Factory guard: …" | A workflow is active and the command matches a guard rule | Run it yourself in your terminal. Policy switches in `.factory/config.json`: `security.allowGitPush` (plain pushes) and `hooks.commandGuard: false` (the whole command guard). `security.blockedCommands` only adds blocks; built-in rules cannot be relaxed one by one. If no workflow should be active, finish or fail it (`factory-state show`) |
| The guard blocks something harmless | The heuristic rule is too broad for your case | Turn the guard off for the repository (`hooks.commandGuard: false`), or report the case. Rules are listed in `docs/contracts/hooks.md` |
| A worker's file write through Bash (`cat > f <<EOF`) was denied because the content mentioned a dangerous command | Before kit 0.1.1 the guard read heredoc bodies as commands | Fixed in 0.1.1. Workers now write files with Write/Edit (worker contract rule 6) |
| A compound command (`cd x && …`, `VAR=1 cmd`) is denied by Claude Code, not by the guard | Claude Code checks each part of a compound command separately | The procedures already use one command per call; this happens only with ad-hoc commands |
| A Bash command containing JSON in a heredoc is denied | Claude Code's permission checker refuses JSON heredoc bodies | The Factory passes JSON through `.factory/workflows/<id>/inbox/*.json` files (ADR-0009) |
| `/factory:start` text appears but nothing happens | The slash command was not at the start of the message | Start the message with `/factory:start` |
| "manifest invalid" in the session notice, or `factory-state` refuses a workflow | The manifest was edited by hand or corrupted | `factory-state validate <id>` shows the errors. Restore the file from git or a backup. Never edit manifests directly |
| "config is invalid … defaults in use" | `.factory/config.json` fails the schema | `factory-state config` lists the errors. Unknown keys and wrong types are rejected, and nothing is partially applied |
| FULL-SPEC is waiting for discovery | `/grill-with-docs` must be typed by you | Type `/grill-with-docs` (or `/mattpocock-skills:grill-with-docs`), answer until it ends, then `/factory:resume` |
| `/grill-with-docs` asks for permission to read its own files | It reads its format files from where it is installed | Approve the reads, or allow `Read(~/.claude/skills/**)` |
| Spec Kit is not detected | No `.specify/init-options.json`, a version other than 1.x, or missing `speckit-*` skills | `factory-state providers` shows the reason. Run `specify init --here --integration claude` |
| A workflow escalated after review | `review.maxIterations` rounds did not reach approval | Read the review reports in `.factory/workflows/<id>/reviews/`. Decide whether to accept the risk (`/factory:resume <id> accept …`), give guidance, or stop |
| A task failed twice and its dependants are blocked | `execution.maxTaskAttempts` failures | `factory-state show <id>` shows the failure. Resume with guidance; the orchestrator can replan |
| `/factory:init` says "the plan changed since it was shown" | A file changed between plan and apply | Expected protection. Review the new plan and approve again |
| `/factory:init` skips a file as `exists-unowned` or `user-modified` | The file exists and the Factory did not create it, or you edited it | It is never overwritten. Merge by hand if you want the kit's version (`factory-install plan` shows the content) |
