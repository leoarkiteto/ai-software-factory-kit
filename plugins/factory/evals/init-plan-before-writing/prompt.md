---
description: /factory:init inspects and shows a plan with the permission rules verbatim, and writes nothing before the user approves.
tags: [needs-bin, installer, safety]
runs: 2
max_turns: 15
allowed_tools: [Bash, Read, Glob, Grep, Skill]
expected_outcome: factory-install inspect/plan run; no apply; no .factory/config.json, settings or rules file is created; the plan shows Bash(factory-state *) and Edit(/.factory/**).
---

/factory:init
