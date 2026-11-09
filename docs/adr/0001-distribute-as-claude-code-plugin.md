---
status: accepted
---
# Distribute the kit as a Claude Code plugin, with an explicit per-repo `init` step

The kit ships as a Claude Code plugin (skills, agents, hooks, `bin/`) listed in a `marketplace.json` that lives in this repository. Plugins update in place, are namespaced so they never collide with a repo's own skills or agents, and are removed cleanly, which covers most of what a custom installer would otherwise do. Plugins cannot ship rules or CLAUDE.md content and cannot write project files. Per-repo artifacts (`.factory/config.json`, optional `.claude/rules/factory-*.md`, an optional CLAUDE.md snippet) are therefore produced by an `init` skill that inspects the target repo, proposes a change plan, and writes nothing without approval.

## Considered Options

- Copy files into the target's `.claude/`. Rejected: it collides with existing skills and agents, has no update path, and makes ownership hard to tell apart.
