# Phase 12: Figma design reference, real-session probe

**Status: partial (2026-11-17).** The remote-server path is confirmed for tool names and screenshot hosts, token mapping was correct against a real theme in two sessions, the ❌ path was exercised once, and both halves of the inline-render fix ran in real sessions (`excludeScreenshot` plus `get_screenshot` in session 4, `fetch-design-image --image` in session 3). The planted-gap model check (item 3), `download_assets` and the other server variants are still open. ADR-0014 rests on two facts inferred from Figma's documentation and from how Claude Code names other MCP servers. This probe confirms them in a real session before the Figma path is called verified. Until then, the repository-image path is the tested one (evals `design-repo-image-note`, `design-pasted-image-asks-to-save`).

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

### Session 2 (2026-11-17)

Setup: the kit (0.4.0-beta) installed in a private product repository: a monorepo whose web app uses Tailwind v4 with a theme in one global CSS file (about 10 brand colour tokens, a spacing scale, and type tokens per breakpoint). Figma's remote MCP server, registered as `figma`, in auto permission mode. Source: a card component from the company's own design-system file, a component set with three variants (desktop default, desktop hover, mobile default). The request named a component that does not exist yet and asked for an image zoom on desktop hover. The workflow ran in STANDARD mode and completed. The design-worker ran on Sonnet.

1. **Tool names: confirmed again for `mcp__figma__…`.** The design-worker reached `get_design_context`, `get_metadata`, `get_variable_defs` and `get_screenshot` under this prefix, from a background subagent, with no permission prompt. The project settings also held an old allow entry for a server registered under another name, which matched nothing in this run. The plugin, connector and desktop prefixes are still untested.
2. **Hosts.**
   - `get_screenshot` on the parent frame returned a `https://www.figma.com/api/mcp/asset/<uuid>.png` URL again. `factory-state fetch-design-image` stored it without authentication (a 790×1024 PNG of about 390 KB, downscaled from the frame's real size). It was fetched within minutes, so no expiry was seen.
   - The asset URLs inside `get_design_context` (SVG icons, frame shapes, sample photos) use the same host under a per-call prefix (`/api/mcp/asset/<uuid>/<id>.svg|png`). Nobody fetched them.
   - `get_design_context` on a single variant returned its screenshot **inline, as image content, with no URL**. Claude Code saved those images to the session's `tool-results/` folder. `fetch-design-image` only takes a URL, so these renders never reached the workflow's `design/` folder. The note pointed to the absolute session paths instead, which other machines and later sessions cannot open.
   - `download_assets` was not called. No new host appeared, so the allow-list in `plugins/factory/lib/design.mjs` and its tests are unchanged. The S3 host is still unconfirmed.
3. **Note quality (real use, not the planted-gap check).**
   - Status `partial`, in the contract format. The worker said why: it read the hover variant's data but skipped its screenshot (`excludeScreenshot`) and could not measure the zoom.
   - **Tokens: correct against the real theme.** Checked by hand afterwards:
     - All 5 colours map to the right theme tokens, with exact hex matches (✅).
     - All 5 type styles map to the right per-breakpoint tokens (✅).
     - Spacing 8/16/24 are confirmed. The worker marked 40 px "not confirmed" because its grep only covered the first four steps of the scale. The theme does have a 40 px step, so a wider grep would have closed this.
     - The two radii were left as ≈ ("carried by existing atoms") instead of being compared with the theme's radius scale.
     - No ❌. The design had no value without a token, so this part of the planted-gap check was not exercised.
   - **Gaps found:**
     - The hover variant changes the image wrapper but gives no scale factor. The worker said it could not read one and pointed to the existing hover utility as the nearest pattern. The user then chose that utility.
     - Missing states: focus, missing image, long text, missing optional fields, many tags.
     - Which fields are optional is not stated in the design.
     - The design calls tags static while the existing sibling component renders them as links.
     - The mobile variant uses desktop text styles for body text.
     - The design's component name differs from the requested name. The worker asked whether the request means a new component or a variant of the existing one.
   - **Gaps missed or left open:**
     - The worker did not check that the existing fallback image is in the repository's public folder. It is.
     - It did not compare the mobile contact-row height (32 px) with the 40 px the existing component uses. The implementer kept 40 px, and the final report flagged it for a visual check.
     - Asset availability was mostly "likely, not verified" (the frame shape and the e-mail icon).
   - **Figma calls: 7.** That is 4 × `get_design_context` (one on the component set, three on the variants), 1 × `get_metadata`, 1 × `get_variable_defs` and 1 × `get_screenshot`. The note says 9, so its self-reported count was wrong.
   - **Code Connect prompt.** `get_design_context` on the component set returned no code, only a Code Connect prompt telling the agent to ask the user about mapping components. The worker treated it as tool text, did not act on it, said so in the note, and re-read each variant with `disableCodeConnect: true`. That cost one call.
4. **Kit problems seen.**
   - **Inline renders are lost.** Today `fetch-design-image` only stores URL renders (see item 2), and the note links to session-local paths. Options:
     - the worker passes `excludeScreenshot: true` and asks for URL renders with `get_screenshot`;
     - the orchestrator copies the saved inline image into `design/` with the same checks.
   - **Wasted Code Connect call.** The design-worker should call `get_design_context` with `disableCodeConnect: true` from the start, since it never maps Code Connect.
   - **Call count.** The note's "Figma calls used" was wrong (9 vs 7). Either the worker counts its tool calls or the field becomes optional.
   - **Contract.** Two qa-worker reports carry `"exitCode": 0` on a validation entry with `status: "not_run"`. The schema should forbid an exit code when the command did not run.
   - **Orchestrator: truncated output.** The orchestrator recorded a failing build as "cause not identified (output truncated before the error)". It should keep the tail of a failing command's output, not the head.
   - **Orchestrator: change outside scope.** It caught a dependency bump made outside every task, logged it as an open issue and left it alone. The user's next workflow settled it. This worked as designed.
   - **Workers and reviewers.** All tasks stayed in scope. Two independent review rounds ran, and the round-1 findings were fixed and confirmed in round 2. There were no permission prompts in auto mode.

**Fixed after session 2:** inline renders. The design-worker now passes `excludeScreenshot: true` to `get_design_context` and takes renders with `get_screenshot`. When a render still comes back inline, `fetch-design-image --image <path>` copies the file Claude Code saved in `tool-results/` into `design/` (tests in `tests/design.test.mjs`).

**Still open after session 2:**
- the planted-gap check, the ❌ path in particular;
- `download_assets` and the S3 host;
- URL lifetime;
- the plugin, connector and desktop prefixes;
- a real session that confirms the inline-render fix.

### Session 3 (2026-11-17)

Setup: same repository, server and permission mode as session 2. Source: a carousel section from the same design-system file, a wrapper frame with a mobile and a desktop variant. The request asked for a new carousel component with scroll snapping, a slide bar on desktop and pagination buttons on mobile. The workflow ran in STANDARD mode and completed.

**Mixed kit versions.** The installed plugin was not updated after session 2, so the agent definitions (the design-worker prompt) came from the cached copy of the commit before the fix. `factory-state` on `PATH`, and with it the guides the orchestrator loads, came from the kit's working copy, which has the fix. So this session tested the orchestrator half of the fix, not the design-worker half.

1. **Tool names:** `mcp__figma__…` again. No permission prompt.
2. **Inline render: the fallback works.**
   - The design-worker used the old prompt. It called `get_design_context` without `excludeScreenshot` and never called `get_screenshot`, so the only render came back inline.
   - It reported the file Claude Code saved in the session's `tool-results/` folder, as session 2 did.
   - The orchestrator followed the new procedure and ran `fetch-design-image --image <path>`. That stored a 1024×393 PNG (about 350 KB) in `design/` and recorded it as an artifact, with no permission prompt.
   - No URL host appeared. `download_assets` was not called.
3. **Note quality.**
   - **Status `partial`, for a real reason.** The design context code left out the desktop slide bar, which shows only in the render. The worker estimated its sizes from the image and marked them `(estimated from image)`. It did not read the bar's own node, although it used only 2 of its 10 calls.
   - **Figma calls: 2** (`get_metadata`, `get_design_context` on the wrapper). The note's count was right this time.
   - **Tokens:**
     - 8 colour and effect values all map to theme tokens with exact values (✅). One shares its value with a token meant for something else, and the note says so.
     - The spacing steps on the 8 px scale map exactly.
   - **❌ path exercised for the first time.**
     - A 28 px gap that is not on the spacing scale was marked ❌.
     - Fixed card widths were marked ❌/≈, against the relative widths an existing carousel uses.
     - The plan handled both as the procedure asks: the gap was out of scope, and the widths follow the existing relative formula. It recorded this under Technical decisions instead of Risks.
   - **Typography was left "not verified".** The worker did not read the type tokens. "Not verified" is not one of the note's three marks (✅/≈/❌).
   - **Gaps found:**
     - The request's ambiguous "card positioning": the design shows start-aligned cards with the next one peeking, but no snap or padding values. The plan turned this into a prop with the design's alignment as the default.
     - Missing states: last card, few cards, hover, focus, disabled, empty, loading, and the range between the design's breakpoint and the project's breakpoint.
     - Empty icon slots in the metadata while the render shows icons.
     - A gallery control inside each card that should not be read as the carousel's own pagination.
   - **Reuse.** It found the existing slider and pagination components and the existing carousel that combines them. It flagged the overlap as a decision for the user. The plan composed the components and left the old carousel alone.
4. **Kit problems seen.**
   - **Stale agents.** A local install can run old agent prompts next to a new CLI without any warning. `factory-state` could warn when the installed plugin's commit differs from the kit it runs from, or the setup guide should say to update or reinstall the plugin after each kit change.
   - **Budget left unused while the note was `partial`.** The prompt could tell the worker to read a missing element's node, or take its render, before falling back to estimating from the image.
   - **The orchestrator edited source code.** The final report lists a one-line fix to the component made by the orchestrator itself, not by a worker. Check this against the orchestrator's contract.
   - **❌ decisions.** The design procedure says to record them under Risks; the plan put them under Technical decisions.

**Still open after session 3:**
- the design-worker half of the inline-render fix (`excludeScreenshot` plus `get_screenshot`), with an updated plugin;
- `download_assets` and the S3 host;
- URL lifetime;
- the plugin, connector and desktop prefixes.

### Session 4 (2026-11-17)

Setup: same repository, server and permission mode. This time the plugin was reinstalled at the commit that holds the inline-render fix. Source: a contact side panel from the same design-system file, a wrapper frame with four variants (one or two contacts × mobile or desktop). The request asked for a new panel component. The workflow ran in QUICK mode, so the orchestrator implemented the single task itself. It was waiting in `integrating` when this was written.

1. **Tool names:** `mcp__figma__…` again. No permission prompt.
2. **Inline-render fix: the design-worker half is confirmed.**
   - The worker called `get_design_context` with `excludeScreenshot: true` and took the render with `get_screenshot`.
   - `get_screenshot` returned a `https://www.figma.com/api/mcp/asset/<uuid>.png` URL. The orchestrator stored it with `fetch-design-image --url`: an 838×922 PNG of about 120 KB. No inline image came back, and nothing was saved to `tool-results/`.
   - The design-context asset URLs used the same host. `download_assets` was not called, and no new host appeared.
   - Together with session 3, both halves of the fix have now run in real sessions.
3. **Note quality.**
   - **Status `complete`.**
   - **Figma calls: 4** (`get_metadata`, `get_design_context`, `get_screenshot`, `get_variable_defs`). The note's count was right. No Code Connect prompt came back, although `disableCodeConnect` was not passed: this frame has no unmapped component set at its root.
   - **Tokens:**
     - 4 colours and 5 type styles map to theme tokens with exact values (✅).
     - Letter spacing was marked ≈ with a correct explanation: Figma states it as a percentage and the theme in `em`, and the two agree.
     - The spacing steps were marked ✅ "by the 8 px-step rule" instead of from a grep. The values are right (checked in session 2).
     - One colour was marked "❓ not verified", which is again outside the ✅/≈/❌ marks.
     - No ❌: every value had a token.
   - **Gaps found:**
     - The request's contact count ("up to one") conflicts with the design's two-contact variants.
     - The design never shows an office-only panel.
     - The shared actions block conflicts with the existing component, which puts buttons under each contact.
     - A frame height that is smaller than the sum of its contents.
     - Two address lines against a component prop that takes a single string.
     - Missing states: no label, no actions, a single action, no phone, loading, empty, error, long text, no avatar, hover, focus, pressed and tablet widths.
   - The orchestrator turned these into three user questions before planning the task.
   - **Reuse.** The worker found that an existing organism already renders almost exactly this frame, and that the frame even carries that component's name. It listed seven concrete differences and left replace-or-wrap to the planner.
4. **Kit problems seen.**
   - **Marks outside the legend.** "❓ not verified" here and "not verified" in session 3. The prompt should say that an unchecked value is not a mark: the worker either reads the token or lists it under *Gaps and questions*.
   - **Inferred tokens.** Spacing tokens inferred from a naming rule were still marked ✅. ✅ should require a value the worker actually read.
   - **QUICK mode.** In QUICK mode the orchestrator implements the task itself, which is by design. Session 3's orchestrator edit happened in STANDARD mode, so that question is still open.

**Fixed after session 4:** token marks. The design-worker prompt now allows only ✅, ≈ and ❌, each requiring a token value the worker read in a theme file during the task. Values it could not check go under *Gaps and questions* as "not checked against the theme". The design procedure tells the orchestrator to check those tokens itself before the plan relies on them.

**Still open after session 4:**
- `download_assets` and the S3 host;
- URL lifetime;
- the plugin, connector and desktop prefixes;
- the ❌ path under the planted-gap check: only seen once (session 3), with no planted asset gap yet;
- whether the orchestrator may edit source code in STANDARD mode (session 3).

### Session 5 (2026-11-17)

Setup: same repository, server and permission mode. The plugin was reinstalled at the commit that holds the token-mark rule. Source: a landscape card from the same design-system file, with a default and a hover variant. The request asked for a desktop-only card whose image zooms slightly on hover, and stated the scale and timing. The workflow ran in QUICK mode, and the orchestrator implemented the task. It was waiting for the user's decision on an unrelated build failure when this was written.

1. **Tool names:** `mcp__figma__…` again. No permission prompt.
2. **Hosts and renders.**
   - The worker called `get_design_context` with `excludeScreenshot: true` and took the render with `get_screenshot`, which returned a `www.figma.com/api/mcp/asset/…` URL. This is the second session in a row with no inline image.
   - The orchestrator stored it with `fetch-design-image --url`: a 1024×777 PNG of about 880 KB.
   - `download_assets` was not called, and no new host appeared.
3. **Note quality.**
   - **Status `partial`. Figma calls: 4**, and the note's count was right.
   - **Token marks under the new rule.**
     - The worker added the token value it read to the table's token column, so every ✅ can be checked against the theme. I checked the spacing steps and the type tokens against the theme, and they are right.
     - Inferred tokens are gone.
   - **❌ path:**
     - A fixed 640 px image width with no token was marked ❌.
     - An 83 px padding that is not on the scale was marked ≈, with both neighbouring tokens and the distance to each. In *Gaps and questions*, the worker explained it as a side effect of centring the content.
     - The hover scale was marked ≈, with the three conflicting values side by side: the design (about 1.27), the request (1.04) and the existing utility (1.06).
   - **Partly compliant:**
     - Font families stayed as a "not checked" row in the table instead of moving to *Gaps and questions*. They were listed there as well.
     - One ✅ carried the comment "value only; usage unverified", which is acceptable.
   - **Gaps found:**
     - **The design does not match the request.** The frame shows an editorial teaser (eyebrow, heading, body, link) with no metadata or tags, while the request and the brief expected a post card. The worker put this at the top of the note.
     - The hover scale conflict above.
     - Hover changes nothing but the image.
     - Missing states: focus, no image, long text, short text, smaller screens.
     - Whether the whole card is a link.
     - Image alt text.
     - Stroke colours that were not read.
   - **The orchestrator checked unverified items.** Before planning, it read the link component and the hover rule, and grepped the type utilities. That is the new step 7 working.
4. **Kit problems seen.**
   - **Conflicts settled without asking.** The design procedure (step 8) says that a conflict between the design and the request goes to the user. The orchestrator settled both conflicts itself: it built what the design shows instead of what the request named, and it used the request's scale instead of the design's. It listed both as "assumptions to confirm" only in the final message, after implementing. Both choices were reasonable, but the user saw them only after the code was written. QUICK mode may need to say that design gaps still stop for the user.
   - **Wrong place for unchecked values.** The worker still used a table row for values it did not check. The rule may need to appear in the table template itself, not only in the procedure. The template comment already says so, so this may just be model drift.
   - **No review.** No independent review ran: QUICK mode with no risk flag. With a design conflict settled by the implementer, a reviewer would have been the only second look.

**Fixed after session 5:** design gaps in QUICK. `workflows/quick.md` now says that a design note's conflicts and behaviour-changing gaps go to the user in one round, before the task is defined. `workflows/design.md` step 8 now applies in every mode, before any code is written, and forbids settling a design-versus-request conflict and reporting it later as an assumption.

**Still open after session 5:**
- `download_assets` and the S3 host;
- URL lifetime;
- the plugin, connector and desktop prefixes;
- a planted missing-asset gap;
- whether the orchestrator may edit source code in STANDARD mode (session 3);
- a real session that confirms QUICK now stops on design gaps.

### Session 6 (2026-11-18)

Setup: same repository, server and permission mode. The installed plugin was at the commit before the QUICK design-gap fix, which did not matter here because the run was STANDARD. **Planted gap: a wrong link.** The request asked for a small form with a text input and a slider, and cited a Figma node that is an unrelated card (four variants, no input, no slider). The workflow completed with two frontend tasks and one independent review round.

1. **Tool names:** `mcp__figma__…` again. No permission prompt.
2. **Renders:** `excludeScreenshot: true` plus `get_screenshot`, which returned a `www.figma.com/api/mcp/asset/…` URL. That makes three sessions in a row without an inline image. The render was not stored, because the note was not used (see below).
3. **Note quality.**
   - **Status `blocked`, for the right reason.**
     - The worker said what the node actually is and that it holds no form, input or slider.
     - It did not describe a form, and did not read the repository's theme, since there was nothing to map.
     - It listed the node's variables "for reference only, not checked against the theme", with no ✅/≈/❌ marks. That follows the session-4 rule.
   - **Figma calls: 4**, and the note's count was right.
4. **Orchestrator.**
   - **It stopped before planning** (`block --kind user_input`) and offered three options:
     - the correct link;
     - PNG exports saved in the repository;
     - going on from the request's text alone, with visuals made from the theme's tokens.
   - It added a few questions, each with a recommendation. One of them ("does the counter show in the input? yes, if the design shows it") assumed a design that did not exist.
   - **The user chose to go on without the design.** The plan said so in its summary and Risks ("no Figma design, so the visuals are invented"), kept a guessed slider range as an assumption, and was approved before any code was written. The final report says that no design exists to compare with.
   - **The workflow survived a `/clear`.** After the clear, `/factory:resume` continued from the block's description alone.
   - **Build.** A build failure caused by local services that were not running was recorded as an issue. The user started the services, the build passed on retry, and the issue was resolved.
5. **Kit problems seen.**
   - **The `blocked` note was not saved.** Procedure step 5 comes after step 4, so the orchestrator never wrote a `design/D1.md`. The only record of what the node shows is the block's one-line description and the plan. A `blocked` note should be saved and recorded too, so a resume or a later reader keeps the evidence.
   - **The procedure has no "go on without the design" option.** Step 4 says not to go on without the design the user cited, but the orchestrator offered that option, and the user took it. That is the user's call, so the procedure should allow it explicitly. When the user does choose it, the plan should say so, and the final report should say that no design exists to compare with. Both happened here.
   - **A hex literal with no design note.** The new component reuses a track colour that has no theme token, as a hex literal copied from an existing component. The "never write a literal" rule lives in the design procedure, which did not apply once the design was dropped. The final report flagged the missing token.

**Fixed after session 6:** `blocked` notes and going on without a design. In `workflows/design.md`, saving the note (now step 4) comes before handling `blocked` (now step 5), so a `blocked` note is always saved and recorded. Step 5 offers three options: the correct link, PNG exports (each as a new brief, `D<n+1>`), or going on without a design, which only the user can choose. When the user chooses it, the plan says so in the Summary and Risks, the theme rules still forbid literals, and the final report states that no design was used.

**Still open after session 6:**
- `download_assets` and the S3 host;
- URL lifetime;
- the plugin, connector and desktop prefixes;
- a planted missing-asset gap;
- whether the orchestrator may edit source code in STANDARD mode (session 3);
- a real session that confirms QUICK now stops on design gaps (session 5 fix);
- a real session that confirms `blocked` notes are saved (session 6 fix).

### Probe: `download_assets` and URL lifetime (2026-11-18)

Not a workflow run. Both checks were made from the kit's repository, against the same design-system file as sessions 2 to 6.

1. **`download_assets`, 1 call on a card node** (after `create_session`).
   - It returned 1 export (the node's render), 2 raw images and 4 SVGs. **All 7 URLs are on `https://www.figma.com/api/mcp/asset/<uuid>[.ext]`.** The raw images have no file extension.
   - A plain `curl` with no cookie or token got HTTP 200 straight away, with no redirect. The responses carry `cache-control: private, no-store`.
   - `fetchDesignImage` stored the export (a PNG of about 1.5 MB) and a raw image (a PNG of about 4.6 MB). It refused the SVG ("not a PNG or JPEG"), as designed.
   - The export is the node at full size, while `get_screenshot` on the same node gave a render downscaled to 1024 px. The kit does not need the larger one, so the design-worker keeps using `get_screenshot`.
   - **The S3 host never appeared** in any session or in this check, so it was removed from the allow-list in `plugins/factory/lib/design.mjs`, and the tests now expect it to be refused. A future S3 URL would be refused, and the orchestrator would ask the user for a PNG export.
2. **URL lifetime, first data point.**
   - The `get_screenshot` URLs kept in the notes of sessions 2, 4 and 5 still returned HTTP 200 with the full PNG, without authentication, 21 to 23.5 hours after they were issued.
   - So the lifetime is at least about one day. The 7-day figure in the tools' text is still unchecked. The next checks are at 7 and 8 days, on 2026-11-24 and 2026-11-25.

**Still open after this probe:**
- URL lifetime beyond one day;
- the plugin, connector and desktop prefixes, and the loopback origin (not planned);
- a planted missing-asset gap;
- whether the orchestrator may edit source code in STANDARD mode (session 3);
- a real session that confirms QUICK now stops on design gaps (session 5 fix);
- a real session that confirms `blocked` notes are saved (session 6 fix).
