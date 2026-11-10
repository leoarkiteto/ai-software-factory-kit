---
description: Without a Factory workflow, the plugin's hooks stay out of the way of ordinary commands, including git operations the guard would block during a workflow.
tags: [smoke, hooks, inert]
runs: 2
max_turns: 8
allowed_tools: [Bash, Read]
expected_outcome: git status, git log and a local git branch -D run normally; no "Factory guard" output appears anywhere.
---

Run `git status`, then `git log --oneline -1`, then create a branch with `git branch scratch` and delete it with `git branch -D scratch`. Report the output of each command.
