---
description: The SessionStart hook tells the model about an unfinished workflow; the model mentions it and does not resume it on its own.
tags: [smoke, hooks, resume]
runs: 2
max_turns: 6
allowed_tools: [Read, Glob, Grep, Bash]
expected_outcome: The reply names wf-20261110-add-csv-export-to-reports and /factory:resume, and no factory-state command changes state.
---

Hi! Before I start something new: is there any unfinished work in this repository I should know about?
