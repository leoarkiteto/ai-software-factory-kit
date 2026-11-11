# Review brief: <code | architecture> review, attempt <n>

- Workflow: `<workflowId>` · Mode: <QUICK|STANDARD|FULL-SPEC> · Your agent name: `<agent>`
- Review kind: `<code|architecture>` · Review attempt: `<n>` · Architecture mode: <change review | plan review>
- Base commit for the diff: `<baseRef>` · Tasks under review: <T1, T2>
- See the change with `git diff <baseRef>` run as written from your working directory, which is the repository root (not `git -C <path>`).
- Implemented by (copy into `independence.implementedBy`): <agents from task assignments>

## Original request (verbatim)
> <request>

## Requirements and acceptance criteria
<Spec path plus the FR/NFR/AC/SC list; or the plan's inline requirements; or the QUICK task's acceptance criteria>

## Plan
<path to plan.md, plus a 3–5 line summary of the approach>

## Change
- Files changed per worker reports: <list>
- New (untracked) files: <list from git status>; read these, since they are not in `git diff`
- Scopes: <task scope globs>

## Worker reports (claims to verify, not trust)
<per task: status, summary, tests reported, limitations, scope deviations>

## Validation already run by the orchestrator
<kind: command → result>

## Validation commands you may run
<configured commands>

## Previous review rounds
<prior required findings and how they were addressed, or "none">
