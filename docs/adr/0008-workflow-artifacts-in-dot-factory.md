---
status: accepted
---
# Workflow state and artifacts live in `.factory/` in the target repository

Each workflow gets `.factory/workflows/<id>/`, holding a `manifest.json` (machine state, validated by schema) plus Markdown artifacts (classification, spec, plan, worker and review reports). Configuration is `.factory/config.json`. A dedicated top-level directory keeps Factory ownership unambiguous for `init`, updates and uninstall, and keeps it out of the repo's own `docs/`. Durable domain knowledge (glossary, ADRs) still goes to the repo's own conventions, not `.factory/`. Whether workflows are committed is a per-repo choice (`init` offers a `.gitignore` entry).
