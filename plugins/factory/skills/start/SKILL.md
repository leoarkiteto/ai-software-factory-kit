---
name: start
description: Start an AI Software Factory workflow for a development request. Classifies it as QUICK, STANDARD or FULL-SPEC and runs the matching workflow with tracked state in .factory/.
argument-hint: "[--mode quick|standard|full_spec] <development request>"
disable-model-invocation: true
allowed-tools: Bash(factory-state *) Edit(/.factory/**) Read Grep Glob
---

# Factory: start a workflow

You are the **orchestrator** of the AI Software Factory, running in the main conversation. You coordinate the work, keep state through `factory-state`, delegate when the workflow says so, and report honestly.

Request: $ARGUMENTS

## Current Factory state in this repository

!`factory-state resume-summary 2>&1 || true`

## Steps

1. **Load the rules.** Read `${CLAUDE_PLUGIN_ROOT}/core/operating-rules.md` and follow it throughout.

2. **Check prerequisites.**
   - If the state output above shows an error running `factory-state`, it is probably missing Node ≥18. Tell the user and stop.
   - If the request above is empty, ask for it and stop.

3. **Check for related active workflows.** If one is listed above and this request continues it, suggest `/factory:resume <id>` instead and wait. Unrelated active workflows can coexist.

4. **Parse the mode override.** A leading `--mode <quick|standard|full_spec>` forces the mode. Remove it from the request text.

5. **Create the workflow.** Pass the request **verbatim** through stdin:
   ```bash
   factory-state new --title "<≤ 8-word title>" --request-file - <<'REQUEST'
   <the request, exactly as written, without the --mode flag>
   REQUEST
   ```
   Note the printed workflow ID. Run `factory-state config` once and keep the effective configuration in mind (validation commands, roles, review policy, protected paths). If it reports config errors, tell the user that defaults are in use and why.

6. **Inspect the repository, read-only and focused.**
   - Locate the code the request touches, its tests, relevant `CLAUDE.md` and rules conventions, and existing domain docs.
   - Stop as soon as you can score the rubric with evidence. This step is not discovery.

7. **Classify.** Read `${CLAUDE_PLUGIN_ROOT}/core/rubric.md` and score each dimension.
   - Write `.factory/workflows/<id>/inbox/classification.json`:
     `{ "scores": { …all ten dimensions… }, "confidence": "low|medium|high", "rationale": "…", "evidence": ["path: fact", …], "discoveryJustified": false }`
   - If the user forced a mode, add `"forceMode": "<mode>", "forceReason": "user requested --mode <mode>"`.
   - Run `factory-state classify <id> --file .factory/workflows/<id>/inbox/classification.json`.
   - Write `.factory/workflows/<id>/classification.md`, three to six lines: the mode, the decisive scores, and the evidence. Record it with `factory-state artifact <id> classification .factory/workflows/<id>/classification.md`.
   - Tell the user the mode and the one-line reason.
   - If the command printed "confirm the mode with the user", ask before continuing (`block --kind user_approval`).

8. **Run the workflow.** Read and follow the playbook for the classified mode:
   - QUICK: `${CLAUDE_PLUGIN_ROOT}/core/workflows/quick.md`
   - STANDARD: `${CLAUDE_PLUGIN_ROOT}/core/workflows/standard.md`
   - FULL-SPEC: `${CLAUDE_PLUGIN_ROOT}/core/workflows/full-spec.md`

   Read referenced procedure files only when you reach that step.

9. **Pausing.** If the workflow must wait for the user, make sure `blockedOn` is recorded, then end your turn by telling the user exactly what you need. They continue with `/factory:resume`.
