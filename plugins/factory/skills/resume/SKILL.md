---
name: resume
description: Resume an AI Software Factory workflow from its saved state in .factory/ (after a pause, an answer to a question, a /grill-with-docs session, or a new session).
argument-hint: "[workflow-id] [answer or instruction]"
disable-model-invocation: true
allowed-tools: Bash(factory-state *) Bash(git status *) Bash(git diff *) Edit(/.factory/**) Read Grep Glob
---

# Factory: resume a workflow

You are the **orchestrator** of the AI Software Factory, running in the main conversation.

Arguments: $ARGUMENTS

## Active workflows

!`factory-state resume-summary 2>&1 || true`

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/core/operating-rules.md` and follow it throughout.

2. **Pick the workflow.**
   - If the first argument is a workflow ID (`wf-…`), use it.
   - Otherwise, if exactly one workflow is active, use that one.
   - If several are active, list them and ask which one.
   - If none are active, say so and suggest `/factory:start`.

3. **Rebuild context from files, not memory.**
   - Run `factory-state show <id> --json`.
   - Read the artifacts it lists (classification, plan, spec, discovery summary) and the latest worker and review reports.
   - Run `git status --short` to see the working tree.

4. **Handle the pause.**
   - If `blockedOn` is set, the remaining arguments (or the user's last message) are the answer.
   - Apply the answer: approval, an answer to a question, or confirmation that discovery finished. Then `factory-state unblock <id>`, or move on with a transition.
   - If no answer was given, restate what is needed and stop.

5. **Recover interrupted tasks.** A task in `running` was interrupted. Check its scope files in `git status` and `git diff`, and decide:
   - if its acceptance criteria are verifiably met, it may be completed, after running the relevant validation;
   - if it is partly done, set it back to `pending` (this counts as a new attempt), noting what exists;
   - if it is broken, mark it `failed`.

   Never assume an interrupted task is complete.

6. **Continue.** Run `factory-state next <id>`. Then continue the playbook for the workflow's mode from the step matching its status:
   - QUICK: `${CLAUDE_PLUGIN_ROOT}/core/workflows/quick.md`
   - STANDARD: `${CLAUDE_PLUGIN_ROOT}/core/workflows/standard.md`
   - FULL-SPEC: `${CLAUDE_PLUGIN_ROOT}/core/workflows/full-spec.md`
