---
status: accepted
---
# Parallel tasks share the checkout with disjoint file ownership; worktree isolation is opt-in

Claude Code subagent worktrees branch from the remote default branch (or local HEAD with `worktree.baseRef: "head"`), never from uncommitted work. They also skip the worktree's own CLAUDE.md and rules, and how their branches are returned and merged is undocumented. Isolated workers would therefore not see their dependencies' output. Tasks run in parallel only when the scheduler confirms their declared file scopes do not overlap, and everything else runs sequentially. Worktree isolation is a per-task opt-in reserved for independent tasks whose prerequisites are already committed.
