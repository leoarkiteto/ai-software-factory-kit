# Task brief: <taskId>: <title>

- Workflow: `<workflowId>` · Task: `<taskId>` · Attempt: `<attempt>` · Your agent name: `<agent>`
- Base commit: `<baseRef>`

## Original request (verbatim, for context only; your assignment is this task)
> <request>

## Task
<description>

## Requirements (verbatim excerpts for requirementRefs)
<FR/AC text, or "see acceptance criteria" in QUICK/STANDARD without IDs>

## Acceptance criteria
1. <criterion>

## Scope
- May modify: <scope.files globs>
- Read-only context: <scope.readOnly, or "anything needed to understand the code">
- Protected (never read or write): <security.protectedPaths>

## Dependencies already completed
- <depId>: <one-line result>, changed <files>
(or "none")

## Constraints and conventions
- <task constraints>
- Follow: <pointers to CLAUDE.md / rules sections / style examples>

## Validation commands you may run
- <kind>: `<command>`  (or "none configured; run the most targeted existing test command for your change if there is an obvious one")

## Previous attempt feedback
<required review findings or validation errors for this task, verbatim, or "none">

## Report
Follow the worker contract. End with the single fenced json report.
