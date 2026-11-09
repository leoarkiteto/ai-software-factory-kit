---
status: accepted
---
# Model routing uses per-call model aliases resolved from config

Each agent definition carries a sensible default `model` alias in its frontmatter. `.factory/config.json` maps roles (orchestrator-facing tiers such as `reasoning` and `efficient`, plus per-role overrides) to aliases, and the orchestrator passes the resolved alias as the Agent tool's `model` parameter. That parameter has the highest precedence but accepts aliases only (`opus`, `sonnet`, `haiku`, `fable`), so config values are validated against that set. A null value means "use the agent default". Full model IDs are never hardcoded.

## Consequences

- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` and org `availableModels` allowlists override or restrict this routing. Reports record the requested alias, not a guaranteed model.
