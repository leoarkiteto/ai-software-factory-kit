# Phase 12: Figma design reference, real-session probe

**Status: partial (2026-11-16).** The remote-server path is confirmed for tool names and screenshot hosts; the planted-gap model check (item 3) and the other server variants are still open. ADR-0014 rests on two facts inferred from Figma's documentation and from how Claude Code names other MCP servers. This probe confirms them in a real session before the Figma path is called verified. Until then, the repository-image path is the tested one (evals `design-repo-image-note`, `design-pasted-image-asks-to-save`).

## What to confirm

1. **Tool names.** With Figma's Claude Code plugin (`claude plugin install figma@claude-plugins-official`), the tools reach the design-worker under `mcp__plugin_figma_figma__…`. Check also, when available, the manual remote server (`mcp__figma__…`), the claude.ai connector (`mcp__claude_ai_Figma__…`) and the desktop server (`mcp__figma-desktop__…`). Method: a probe subagent with the design-worker's `tools` line that lists the tools it sees, as for Context7 in ADR-0013.
2. **Screenshot hosts.** The hosts of the URLs `get_screenshot` and `download_assets` return, whether they download without authentication, and roughly how long they stay valid. Update the allow-list in `plugins/factory/lib/design.mjs` and its tests to match.
3. **Model.** The design-worker on Sonnet, against a frame with three planted gaps (a missing state, a value with no theme token, an asset not exported), finds all three and maps the remaining tokens correctly.

## Results

### Session 1 (2026-11-16)

Setup: Figma's remote MCP server, authenticated with `/mcp` (registered as `figma`), on a Starter plan with a Full seat. Source: a frame from a public Community file (Gym Fitness App UI Kit, node `3:787`, a 375×812 mobile screen). The design-worker ran on Sonnet with a brief that had no target repository and a budget of about 4 Figma calls.

1. **Tool names: confirmed for `mcp__figma__…`.** The design-worker reached `get_design_context` and `get_screenshot` under this prefix. The plugin prefix (`mcp__plugin_figma_figma__…`), the claude.ai connector and the desktop server were not tested.
2. **Screenshot host: confirmed for `get_screenshot`.**
   - `get_screenshot` returned `https://www.figma.com/api/mcp/asset/<uuid>.png`. This host matches the `figma.com` suffix already in the allow-list and is already covered by `tests/design.test.mjs`.
   - A plain `curl` with no cookies or token returned HTTP 200 with `image/png`, a 375×812 PNG of 43 KB, and no redirect. The response carries `cache-control: private, no-store`.
   - Validity was not measured. The design-worker reported that the asset URLs from `get_design_context` expire after 7 days. That figure comes from the tool's text and was not checked.
   - `download_assets` was not called. The S3 host in the allow-list (`figma-alpha-api.s3.us-west-2.amazonaws.com`) is still unconfirmed.
3. **Model: partly observed, not the planned check.**
   - The design note came back in the contract format with status `complete`, using 2 Figma calls (`get_design_context`, `get_screenshot`). `get_variable_defs` was skipped because the design context already named the styles.
   - Without planted gaps, the worker found the frame's real problems: the week strip overflows the frame (it ends at x = 388 on a 375 frame), and the last card overlaps the navigation bar. It also listed missing states (loading, error, active nav item, rings at 0% and 100%) and copy problems (missing spaces and accents, a placeholder value). It marked image-based values `(estimated from image)`.
   - The brief itself contained a wrong premise: it described the empty state as "no workouts finished" on a screen with no workout list. The worker reported the mismatch as a gap instead of inventing a state.
   - Token mapping was not exercised, because there was no repository to map onto.

**Open after session 1:**
- the three-planted-gap check against a repository with a theme;
- `download_assets` and its hosts;
- URL lifetime;
- the plugin, connector and desktop prefixes.

**Finding for the design:** `get_design_context` returns asset URLs (icons, ring SVGs, a photo) on the same short-lived hosts. `fetch-design-image` refuses SVG and only stores renders, so these assets are not kept today. Workers that need them must get them some other way before the URLs expire.

**Quota:** the Starter plan's monthly MCP quota is small. Plan further probes as one frame per run.
