# Contracts

Implementation-level contracts between the Factory's components. `docs/architecture.md` describes the logical architecture; these documents pin down data shapes, rules and hand-offs. Machine-checkable parts live in `plugins/factory/core/schemas/` and are enforced by `plugins/factory/lib/`.

| Contract | Covers | Schema(s) |
|---|---|---|
| [workflow-state.md](workflow-state.md) | Statuses, transitions per mode, task DAG, review accounting, resume, artifact layout | `manifest`, `task` |
| [classification.md](classification.md) | Rubric, mode selection, uncertainty handling | `classification` |
| [discovery-provider.md](discovery-provider.md) | `/grill-with-docs` integration, native fallback, completion, outputs | `manifest#/$defs/providerUse` |
| [specification-provider.md](specification-provider.md) | Spec contract, completeness check, Spec Kit mapping, plan contract | — (Markdown, checked by `factory-spec`) |
| [workers-and-reviewers.md](workers-and-reviewers.md) | Roles, worker I/O, reviewer I/O, independence, bounded feedback loop | `task`, `worker-report`, `review-report` |
| [configuration.md](configuration.md) | Config resolution, sections, model routing | `config` |
| [installation.md](installation.md) | Plugin vs repo layers, init procedure, update, removal | `install-receipt` |

Status of enforcement (updated each phase):

| Rule | Enforced by | Since |
|---|---|---|
| Schema shape of config, manifest, task, reports, receipt, classification | `lib/schema.mjs` | Phase 2 |
| Config merge and semantic checks; model resolution | `lib/contracts.mjs` | Phase 2 |
| Review outcome vs findings; independence claim | `lib/contracts.mjs` | Phase 2 |
| Worker scope deviations | `lib/contracts.mjs` + `lib/glob.mjs` | Phase 2 |
| Status transitions, DAG acyclicity, ready set, failure propagation, review limit | `lib/state.mjs` | Phase 3 (planned) |
| Spec completeness | `factory-spec check` | Phase 5 (planned) |
