---
status: accepted
---
# Spec Kit is an optional specification provider limited to specify, clarify and plan

When `.specify/init-options.json` exists, the Factory may delegate specification to Spec Kit's `speckit-specify`, `speckit-clarify` and `speckit-plan` skills (1.0.x naming, verified) and map `specs/<feature>/spec.md` and `plan.md` onto its own logical spec contract. The Factory never uses `speckit-tasks` or `speckit-implement`, because task decomposition, execution and review belong to the orchestrator. Without Spec Kit, local templates produce the same contract. The provider is detected by version and never run implicitly via `specify init`.
