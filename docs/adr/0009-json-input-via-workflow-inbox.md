---
status: accepted
---
# Skills pass JSON to `factory-state` through a workflow inbox, not heredocs

Claude Code's permission checker refuses Bash commands whose heredoc body contains JSON (`{…}`), even when the command matches an allow rule such as `Bash(factory-state *)`. A plain-text heredoc is accepted. This was verified in headless runs on 2.1.319. Skills therefore write JSON with the Write tool to `.factory/workflows/<id>/inbox/<name>.json` and pass that path with `--file`. Skill frontmatter pre-authorises `Edit(/.factory/**)` (verified: writes inside `.factory/` need no prompt, writes elsewhere still do). `factory-state` deletes an inbox file once the command succeeds and keeps it on rejection, so the model can fix and resubmit. A related rule: one `factory-state` command per Bash call. Variable assignments, `cd`, `;`, `&&` and `echo` around it are checked as separate commands and get denied.

## Considered Options

- JSON in heredocs: refused by the permission checker.
- Flag-only CLI input: workable for simple records, but unwieldy for task DAGs and reports.
- Asking users to allow arbitrary writes: a broader permission than the Factory needs.
