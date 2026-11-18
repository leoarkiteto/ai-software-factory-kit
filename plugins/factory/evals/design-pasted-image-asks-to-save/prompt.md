---
description: A request that refers to a screenshot only pasted into the chat makes the orchestrator ask for it to be saved in the repository, instead of designing from nothing or dispatching the design-worker.
tags: [needs-bin, workflow, design, smoke]
runs: 2
max_turns: 30
timeout_seconds: 600
allowed_tools: [Bash, Read, Edit, Write, Glob, Grep, Skill, Agent]
expected_outcome: The workflow pauses and asks the user to save the screenshot in the repository (for example under docs/design/) and reply with its path; no design-worker is dispatched and no file under src/ is changed.
---

/factory:start Make the orders list in src/ui/orders-list.js look like the screenshot I pasted in the chat above: a header with the order count and a search field.
