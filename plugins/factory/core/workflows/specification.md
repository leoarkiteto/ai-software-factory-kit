# Specification Procedure (FULL-SPEC, status `specifying`)

The spec turns the discovery summary into **verifiable requirements** with stable IDs. Contract: `docs/contracts/specification-provider.md` in the kit.

## 1. Choose the provider

Run `factory-state providers`. Use the `specification … -> <provider>` line. Record it with `factory-state provider <id> specification --requested <configured> --status in_progress`.

## 2a. Local provider

1. Write `.factory/workflows/<id>/spec.md` from `factory-state guide templates/spec`. Use the request, `discovery-summary.md`, the glossary terms and the ADRs.
   - Use the glossary's canonical terms.
   - Every decision in the summary must appear as a requirement, a constraint, or an explicit exclusion.
   - Take edge cases from the summary's Behaviour section, and add the obvious ones you can derive.
2. `factory-state artifact <id> spec .factory/workflows/<id>/spec.md`
3. `factory-state provider <id> specification --used local --status completed --evidence "local template"`

## 2b. Spec Kit provider (1.x)

The `speckit-*` skills are model-invocable. Invoke them with the Skill tool.

1. **Specify.** Invoke `speckit-specify`. As its argument, give the request plus the content of `discovery-summary.md` (decisions, behaviour, scope, constraints). It creates `specs/<feature>/spec.md` and runs Spec Kit's own scripts. Follow its instructions, but **never** let it go past specification.
2. **Clarify.** If the spec contains `[NEEDS CLARIFICATION` markers, invoke `speckit-clarify`. Answer from the discovery summary where possible, and ask the user only for what remains open.
3. **Plan input (optional).** You may invoke `speckit-plan` for its technical research. The Factory's own `plan.md` remains the plan of record, and links Spec Kit's plan.
4. **Never invoke** `speckit-tasks`, `speckit-implement` or `speckit-taskstoissues`. Decomposition and execution belong to the Factory.
5. Record it:
   - `factory-state artifact <id> spec specs/<feature>/spec.md`
   - `factory-state provider <id> specification --used spec-kit --version <version> --status completed --evidence "speckit-specify created specs/<feature>/spec.md"`
6. **Supplements and mapping.** Start `.factory/workflows/<id>/plan.md` (`factory-state artifact <id> plan …`) with two sections. Do not edit Spec Kit's files.
   - `## Spec supplements`, with `### Scope` (In scope / Out of scope), `### Non-functional requirements` (`**NFR-n:**` items, or "None identified") and `### Validation requirements`.
   - `## Acceptance criteria mapping`: a table `| AC | Source | Requirements |`, with rows such as `| AC-1 | User Story 1, scenario 1 | FR-001 |`. Spec Kit's success criteria may be mapped as a source, as in `| AC-4 | SC-002 | FR-003 |`. Every FR must appear in at least one row.

## 3. Completeness check

Run `factory-state spec-check <id>`. Fix every error it reports and repeat. The check confirms structure and traceability, not quality.

## 4. User approval

Present the summary, In/Out scope, the FR list, the AC list and the non-blocking open questions with their defaults. Then `block --kind user_approval`. On approval: `factory-state transition <id> planning --reason "spec approved by user"`. The CLI re-runs the completeness check.
