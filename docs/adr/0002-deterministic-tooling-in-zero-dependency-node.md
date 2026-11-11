---
status: accepted
---
# Deterministic tooling is zero-dependency Node.js exposed through the plugin `bin/`

State transitions, DAG scheduling, config/schema validation, hook logic and installer planning are deterministic scripts, not prompts. They are written for Node ≥18 with no npm dependencies, tested with `node:test`, and shipped in the plugin `bin/` directory, which Claude Code puts on the Bash tool's `PATH` (verified). Skills call them by name, so no install step or path variable is needed. With zero dependencies there is no `npm install` in target repos and no supply-chain surface.

## Consequences

- Node ≥18 becomes a runtime prerequisite on the user's machine. `init` checks for it and reports clearly when it is missing.
- JSON Schema validation is hand-written for the kit's own small schemas rather than coming from a library.
- Why plain JavaScript rather than TypeScript or Go, and when to revisit: ADR-0012.
