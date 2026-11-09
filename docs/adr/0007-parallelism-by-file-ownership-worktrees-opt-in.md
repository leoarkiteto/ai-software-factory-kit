---
status: accepted
---
# Parallel tasks share the checkout with disjoint file ownership; worktree isolation is not supported in v0.1

Claude Code subagent worktrees branch from the remote default branch (or local HEAD with `worktree.baseRef: "head"`), never from uncommitted work. They also skip the worktree's own CLAUDE.md and rules, and how their branches are returned and merged is undocumented. Isolated workers would therefore not see their dependencies' output. Tasks run in parallel only when the scheduler confirms their declared file scopes do not overlap, and everything else runs sequentially. Worktree isolation is a per-task opt-in reserved for independent tasks whose prerequisites are already committed.

## Update (Phase 5 probe, Claude Code 2.1.319)

A subagent spawned with `isolation: "worktree"` ran in `.claude/worktrees/agent-<id>` on a branch `worktree-agent-<id>`, which the Agent result reported as `worktreePath` and `worktreeBranch`. Uncommitted files from the main checkout were absent there. The worker's changes stayed **uncommitted inside the worktree**. Bringing them back would take a commit, patch or merge step, each a separate permission-gated git operation with conflict risk. Version 0.1 therefore sets `execution.worktreeIsolation` to `never` by default, and the execution procedure never passes `isolation`. The config value `opt_in` is reserved until an integration step is designed and tested.

