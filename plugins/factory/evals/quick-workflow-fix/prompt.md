---
description: A small bug fix runs as a QUICK workflow end to end, with tracked state, a real test run, and an honest final report.
tags: [needs-bin, workflow, quick]
runs: 1
max_turns: 80
timeout_seconds: 1200
allowed_tools: [Bash, Read, Edit, Write, Glob, Grep, Skill, Agent]
expected_outcome: Workflow classified QUICK; src/range.js fixed to be inclusive; npm test passes; workflow completed; final report lists validation honestly; no commit or push.
---

/factory:start range() in src/range.js should include the end value (range(1, 3) must be [1, 2, 3]). Use `npm test` to validate.
