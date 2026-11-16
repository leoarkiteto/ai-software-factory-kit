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
- Research: <for each research note the task relies on: `.factory/workflows/<id>/research/R<n>.md` and the answers it needs, quoted. These notes reflect the current docs for the pinned versions; follow them over your own memory of the API, and record in `limitations` anything that contradicts them. Or "none">
- Design: <for each design note the task relies on: `.factory/workflows/<id>/design/D<n>.md` and its images, with the layout, tokens, components, states and texts the task needs, quoted. What the design shows is required; build it from the repository's tokens and components, never hard-coded values or code copied from Figma. Or "none">
- Follow: <pointers to CLAUDE.md / rules sections / style examples>

## Validation commands you may run
- <kind>: `<command>`  (or "none configured; run the most targeted existing test command for your change if there is an obvious one")

## Previous attempt feedback
<required review findings or validation errors for this task, verbatim, or "none">

## Report
Follow the worker contract. End with the single fenced json report.
