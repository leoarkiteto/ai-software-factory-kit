# Contract: Specification and Planning

Decision record: ADR-0006. Discovery inputs: discovery-provider.md §4.

The specification turns understanding into **implementation-ready, verifiable requirements**. The plan turns the specification into **architecture decisions and a task DAG**. They are separate stages (`specifying`, `planning`) with separate artifacts.

## 1. Logical specification contract

Whatever provider produces it, the spec must contain the sections below, with stable IDs. IDs are what tasks (`requirementRefs`) and reviews (`requirementsCoverage`) point to.

| Section | Requirement |
|---|---|
| Summary | 2–5 sentences; links the original request |
| Scope | **In scope** and **Out of scope** lists. Exclusions are explicit |
| Functional requirements | `FR-n`: one testable behaviour each |
| Non-functional requirements | `NFR-n`: performance, security, accessibility, compatibility…; may be "None identified" |
| Acceptance criteria | `AC-n`, each referencing ≥1 `FR`/`NFR`; phrased as observable outcomes (Given/When/Then allowed) |
| Edge cases | Each with expected behaviour |
| Constraints and assumptions | Carried from discovery; each assumption marked *confirmed* or *assumed* |
| Validation requirements | How each AC will be verified: test type, command, or manual check |
| Open questions | Must be empty, or each item marked *non-blocking* with a chosen default |

### Completeness check (deterministic, `factory-spec check`, Phase 5)

The spec **fails** the check when any of the following is true:

- A required section is missing.
- There are no `FR` or no `AC` entries.
- An `AC` references no requirement, or a reference does not exist.
- An `FR` is not covered by any `AC`.
- An open question is not marked non-blocking.
- An ID is duplicated.

The check does not judge *quality*. Quality is judged by the user's approval and, in FULL-SPEC, by the Architecture Reviewer at plan review.

`specifying → planning` requires the check to pass. In FULL-SPEC it also requires the user's approval of the spec.

## 2. Providers

### 2.1 `local` (always available)

The template lives at `plugins/factory/core/templates/spec.md` (Phase 5). Output goes to `.factory/workflows/<id>/spec.md`. STANDARD workflows use a reduced form: Summary, Scope, FR, AC, Validation.

### 2.2 `spec-kit` (optional, verified against 1.0.1)

**Detection.** `.specify/init-options.json` exists, its `speckit_version` is ≥ 1.0.0, and `.claude/skills/speckit-specify/SKILL.md` exists. Record `providers.specification.version`.

**Selection.** Spec Kit is used when `specification.provider` is `spec-kit`, or when it is `auto` and Spec Kit is detected. If it is forced but undetected, the Factory reports this and falls back to `local`, never running `specify init` implicitly, since that writes into the repo.

**Invocation.** The `speckit-*` skills are model-invocable.

| Step | Spec Kit skill | Notes |
|---|---|---|
| Specify | `speckit-specify` | Input: request + `discovery-summary.md` content |
| Clarify | `speckit-clarify` | Only if its spec has unresolved markers |
| Plan | `speckit-plan` | Used as the *technical plan input*; the Factory still produces its own task DAG |
| — | `speckit-tasks`, `speckit-implement`, `speckit-taskstoissues` | **Not used.** Decomposition and execution belong to the orchestrator |

**Mapping** (verified against the 1.0.1 `spec-template.md`). `manifest.artifacts.spec` points to `specs/<feature>/spec.md`. `artifacts.plan` points to the Factory's `plan.md`, which links Spec Kit's `plan.md`. Spec Kit's files are never rewritten.

| Spec Kit section | Factory contract |
|---|---|
| `Functional Requirements` → `FR-001…` | `FR-n`; IDs used as-is |
| `Success Criteria` → `SC-001…` | Measurable outcomes; referenced directly as `SC-n` and treated as acceptance criteria |
| `User Story N` → `Acceptance Scenarios` (unnumbered) | The Factory assigns `AC-n` in a mapping table in `plan.md` (`AC-3 = User Story 2, scenario 1`) |
| `Edge Cases` | Edge cases |
| `Assumptions` | Constraints and assumptions |
| `[NEEDS CLARIFICATION: …]` markers | Open questions; any remaining marker fails the completeness check, so run `speckit-clarify` |
| *(absent)* Scope / Out of scope, NFR, Validation requirements | Filled in `plan.md` under "Spec supplements" |

**Version drift.** If the detected major version is not 1, the adapter refuses with an explicit message and falls back to `local`, rather than guessing command names.

## 3. Planning contract: `plan.md`

| Section | Content |
|---|---|
| Approach | The chosen design, in brief, with rejected alternatives if non-obvious |
| Components affected | Paths or modules |
| Technical decisions | Each one marked *ADR-worthy* or not. ADR-worthy decisions are written to `docs/adr/` with user approval |
| Interfaces and contracts | APIs, types or schemas that parallel tasks depend on. Defining these first is what makes frontend/backend parallelism safe |
| Task DAG | Rendered table of `manifest.tasks` (ID, title, role, dependsOn, scope, requirementRefs) |
| Validation strategy | Which configured commands run when; new tests required |
| Risks | With mitigation |

`planning → executing` requires:

- the DAG to pass validation (acyclic, refs exist, every FR referenced by at least one task);
- in STANDARD and FULL-SPEC, the user's approval of the plan;
- in FULL-SPEC, an Architecture Reviewer pass on the plan when `review.architecture.full_spec` is not `never`.

## 4. Extending

A new spec provider declares detection, invocation and a mapping onto §1. The completeness check, planning and execution are unchanged.
