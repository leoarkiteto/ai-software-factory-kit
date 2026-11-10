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
| [hooks.md](hooks.md) | Plugin hooks: resume notice, command/file guards, config and manifest validation, optional format | `config#/properties/hooks`, `config#/properties/security` |
| [installation.md](installation.md) | Plugin vs repo layers, init procedure, update, removal | `install-receipt` |

Status of enforcement (updated each phase):

| Rule | Enforced by | Since |
|---|---|---|
| Schema shape of config, manifest, task, reports, receipt, classification | `lib/schema.mjs` | Phase 2 |
| Config merge and semantic checks; model resolution | `lib/contracts.mjs` | Phase 2 |
| Review outcome vs findings; independence claim | `lib/contracts.mjs` | Phase 2 |
| Worker scope deviations | `lib/contracts.mjs` + `lib/glob.mjs` | Phase 2 |
| Status transitions per mode, guards, mode-change rules, history | `lib/state.mjs` | Phase 3 |
| DAG validation (duplicates, unknown/self deps, cycles), plan checks (roles, worktree policy, FR coverage) | `lib/state.mjs` | Phase 3 |
| Ready set, scheduling with file-scope overlap and concurrency limit | `lib/state.mjs` + `lib/glob.mjs` | Phase 3 |
| Task attempts, retry limit, failure propagation to transitive dependants | `lib/state.mjs` | Phase 3 |
| Review round numbering, iteration limit, review decision (rework / escalate / integrate) | `lib/state.mjs` | Phase 3 |
| Rubric total, thresholds, escalators, overrides, confirmation and review policy | `lib/classify.mjs` | Phase 3 |
| Validated, atomic persistence; out-of-repo artifact paths rejected | `lib/store.mjs` | Phase 3 |
| Single writer of manifests | `bin/factory-state` (CLI) | Phase 3 |
| Spec completeness (local + Spec Kit with supplements), discovery summary completeness, provider evidence, FR coverage by tasks | `lib/spec.mjs`, `lib/providers.mjs`, `factory-state spec-check / discovery-check`, enforced on transitions | Phase 6 |
| Inert-unless-active hooks: resume notice, command guard, protected paths, manifest write guard, config/manifest validation after edits, optional post-edit format | `lib/hooks.mjs`, `lib/hook-main.mjs`, `hooks/hooks.json` | Phase 7 |
| Repository integration: read-only inspect, plan with hash-bound approval, atomic apply, receipt with per-entry hashes, idempotent re-run, update of unmodified owned content, removal of intact content only | `lib/installer.mjs`, `bin/factory-install`, `skills/init` | Phase 8 |
