# Phase 12: Figma design reference, real-session probe

**Status: pending.** ADR-0014 rests on two facts inferred from Figma's documentation and from how Claude Code names other MCP servers. This probe confirms them in a real session before the Figma path is called verified. Until then, the repository-image path is the tested one (evals `design-repo-image-note`, `design-pasted-image-asks-to-save`).

## What to confirm

1. **Tool names.** With Figma's Claude Code plugin (`claude plugin install figma@claude-plugins-official`), the tools reach the design-worker under `mcp__plugin_figma_figma__…`. Check also, when available, the manual remote server (`mcp__figma__…`), the claude.ai connector (`mcp__claude_ai_Figma__…`) and the desktop server (`mcp__figma-desktop__…`). Method: a probe subagent with the design-worker's `tools` line that lists the tools it sees, as for Context7 in ADR-0013.
2. **Screenshot hosts.** The hosts of the URLs `get_screenshot` and `download_assets` return, whether they download without authentication, and roughly how long they stay valid. Update the allow-list in `plugins/factory/lib/design.mjs` and its tests to match.
3. **Model.** The design-worker on Sonnet, against a frame with three planted gaps (a missing state, a value with no theme token, an asset not exported), finds all three and maps the remaining tokens correctly.

## Results

(to be filled in by the probe)
