---
status: accepted
---
# The orchestrator is a main-thread skill, not a subagent

Claude Code allows nested subagents (default depth 3). Even so, the orchestrator runs as a skill in the user's main conversation. It has to pause for human input: discovery via `/grill-with-docs` can only be started by the user, and approvals and escalations go to the user. Its progress must also stay visible. Workers and reviewers are leaf subagents with `Agent` excluded from their tools, so they cannot delegate further or expand scope. Context pressure on the main thread is handled by keeping all workflow state in `.factory/` files, so a workflow can be compacted or resumed.
