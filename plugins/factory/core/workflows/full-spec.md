# FULL-SPEC Workflow

For complex, architectural, cross-domain or uncertain work. Discovery comes before specification, specification before planning, and planning before any implementation.

Stages: `classifying → discovering → specifying → planning → executing ⇄ reviewing → integrating → completed`

**Do not modify product code before the plan is approved.** Discovery may write domain docs (`GLOSSARY.md`, ADRs), and nothing else.

## 1. Repository discovery (before talking to the user)

Inspect the repository for everything the request touches: modules, data models, existing behaviour, tests, `CLAUDE.md` and rules, `GLOSSARY.md` / `GLOSSARY-MAP.md`, `docs/adr/`, `.specify/`. For a wide sweep you may delegate to the `Explore` agent. Collect facts with file references.

## 2. Discovery (`discovering`)

`factory-state transition <id> discovering --reason "classified full_spec: ..."`

Follow `factory-state guide workflows/discovery`. It covers detecting `/grill-with-docs`, writing the brief, pausing for the user to invoke it, the native fallback and the completion criteria. Leave this stage only once `providers.discovery.status` is `completed`, and only after `discovery-summary.md` is written and has no blocking open questions.

## 3. Specification (`specifying`)

`factory-state transition <id> specifying --reason "discovery completed via <provider>"`

Follow `factory-state guide workflows/specification`. Choose a provider (Spec Kit or local), produce the spec, and run the completeness check. Show the user the spec summary (FR, AC, scope) and get their approval (`block --kind user_approval`).

## 4. Planning (`planning`)

`factory-state transition <id> planning --reason "spec approved by user"`

- Write `plan.md` from `factory-state guide templates/plan`. With Spec Kit, extend the `plan.md` you started in specification and keep its supplements and mapping sections. Define interfaces and contracts **before** the tasks that use them, so that parallel tasks have a stable contract.
- Decompose the plan (`factory-state guide workflows/decomposition`). Every `FR` must be referenced by at least one task.
- **Plan review:** follow "Plan review" in `factory-state guide workflows/review` (`factory-state plan-review`). Resolve required findings before asking for approval.
- Get the user's approval of the plan, then `transition executing --reason "plan approved by user"`.

## 5. Execute

Follow `factory-state guide workflows/execution`.

## 6. Review

Follow `factory-state guide workflows/review`. Code review and architecture review are both required in FULL-SPEC.

## 7. Integrate and validate against the spec

- `transition integrating`. Run `validation.final` and record the results.
- Walk every `FR`, `NFR`, `AC` and `SC` in the spec and mark it met, partial or not_met, with evidence, in the final report. Unmet items become issues and need the user's decision.
- Failures that predate the workflow, and issues fixed during it, are handled as in QUICK step 6 (`factory-state guide workflows/quick`).
- Write the final report and `transition completed`.
