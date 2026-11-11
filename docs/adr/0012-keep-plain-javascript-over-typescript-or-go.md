---
status: accepted
---
# The deterministic tooling stays in plain JavaScript; TypeScript and Go are deferred

ADR-0002 put the deterministic tooling in zero-dependency Node.js. This record explains why that code is plain JavaScript rather than TypeScript, and when a rewrite in Go would be worth it.

## Context

- **No build step at install.** `claude plugin install` copies the plugin's files from the marketplace's git source, and the kit does not rely on any build step running on the user's machine. Whatever is in the repository must run as it is.
- **Skills, agents and hooks call the tooling only through its CLI** (`factory-state`, `factory-install`, `hooks/factory-hook.mjs`). The CLI is the interface between the prompt layer and the deterministic layer. The permission rules (`Bash(factory-state *)`, ADR-0010) match the command name, not the implementation.
- **Size of the code to port:**
  - about 3,000 lines in `lib/`, the CLIs and the hook entry point;
  - about 1,600 lines of tests (136 tests);
  - a hand-written JSON Schema subset validator.
- **Hooks run on every matching tool call** in every session that has the plugin enabled. Outside a workflow, the Node start-up plus the `.factory/` probe costs about 40 ms per call.

## Decision

1. **Keep plain JavaScript (ES modules) for Node ≥ 18.**
   - It runs exactly as committed: no compilation, no `dist/` to keep in sync with the source, no `node_modules`.
   - That keeps the zero-dependency and no-supply-chain properties of ADR-0002.
2. **Get type checking without a build when it is wanted:** `// @ts-check` with JSDoc types in `lib/`, and `tsc --noEmit` in CI.
   - TypeScript stays a development-only dependency and is never shipped.
   - This is optional; adopting it does not need a new decision.
3. **Defer a Go rewrite.** The CLI boundary makes a later switch transparent to every skill, agent, hook and permission rule. Revisit when one of these holds:
   - Node ≥ 18 as a prerequisite is a real obstacle for adopters (for example, Go or Python teams with no Node toolchain);
   - hook latency becomes noticeable in practice;
   - the core grows enough that compile-time types and a single static binary clearly outweigh the distribution cost below.

## Considered Options

- **TypeScript compiled to JavaScript, with `dist/` committed.**
  - Better editor support and types.
  - Costs a build step, a committed build output that can drift from the source, and a dev toolchain for every change.
  - Rejected for v0.1: JSDoc with `@ts-check` gives most of the benefit at none of the distribution cost.
- **TypeScript run directly by Node (type stripping).**
  - Recent Node releases can execute `.ts` files by stripping types: from 22.6 behind a flag, on by default in later releases.
  - That would raise the floor from Node 18 to a recent release.
  - Type stripping also covers only erasable syntax, so it is not full TypeScript.
  - Revisit when the minimum supported Node line includes it by default.
- **Go, shipped as prebuilt binaries.**

  *Gains:*
  - No Node prerequisite for users.
  - Hook start-up drops from about 40 ms to a few milliseconds.
  - Static types.
  - The standard library covers everything the kit needs: JSON, files, globbing and hashing.

  *Costs:*
  - **Prebuilt binaries in the repository.** Because nothing compiles at install, the repository must carry a binary per platform: darwin arm64/amd64, linux arm64/amd64, windows amd64. Each is several MB. A small launcher would pick the right one, and a CI release pipeline would have to produce them.
  - **Trust.** Users would receive opaque binaries instead of readable source. That calls for reproducible builds or signed releases to stay auditable.
  - **A full port of `lib/` and the tests.** The current tests are a good executable specification for the port.

  Deferred, with the revisit triggers above.
- **Python.** Not universally present on developer machines either, and it brings its own packaging questions. It offers nothing over Node for this kit.
