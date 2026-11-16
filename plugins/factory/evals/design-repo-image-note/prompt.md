---
description: A request that cites a design image in the repository gets a design note from the design-worker, recorded as a design artifact, and the design's gaps come back to the user before any UI code is written.
tags: [needs-bin, workflow, design]
runs: 1
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Bash, Read, Edit, Write, Glob, Grep, Skill, Agent]
expected_outcome: The design-worker is dispatched with docs/design/status-chips.png; its note is saved under .factory/workflows/<id>/design/ and recorded as a design artifact; the workflow pauses asking about the design's gaps (states not shown, the chip background colour that has no theme token); no file under src/ is changed.
---

/factory:start Add status filter chips ("All", "Pending", "Delivered") above the orders list rendered by src/ui/orders-list.js, as in docs/design/status-chips.png. The first chip is the selected one. Use `npm test` to validate.
