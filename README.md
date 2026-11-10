# AI Software Factory Kit

A Claude Code plugin that runs development requests through a workflow sized to the task:

| Mode | When | What happens |
|---|---|---|
| **QUICK** | small, local, low-risk changes | implement → validate → (optional) review → report |
| **STANDARD** | features touching several components | plan → task DAG → parallel workers → independent review → integrate |
| **FULL-SPEC** | high uncertainty or architectural impact | discovery (`/grill-with-docs`) → specification (local or GitHub Spec Kit) → reviewed plan → STANDARD execution |

A deterministic rubric classifies each request. Workflow state lives in `.factory/` in your repository, and the zero-dependency `factory-state` CLI is the only thing that changes it. Workers and reviewers are Claude Code subagents. Reviews are independent of the implementer, and rework stops after a bounded number of rounds. While a workflow is active, safety hooks block pushes, deployments, destructive commands and secret files.

## Quick start

```bash
# 1. Add the marketplace (this repository) and install the plugin
claude plugin marketplace add /path/to/ai-software-factory-kit     # or <owner>/<repo> once it is on GitHub
claude plugin install factory@ai-software-factory-kit
```

```text
# 2. In your project, inside Claude Code
/factory:init                       # optional but recommended: config, .gitignore, permissions
/factory:start Add a status filter to the orders list
/factory:resume                     # continue a paused or interrupted workflow
```

Requires Claude Code ≥ 2.1.319 and Node.js ≥ 18. Two optional integrations: [`/grill-with-docs`](https://github.com/mattpocock/skills) for discovery and [GitHub Spec Kit](https://github.com/github/spec-kit) 1.x for specifications.

## Documentation

| Guide | |
|---|---|
| [Installation](docs/guide/installation.md) | plugin, `/factory:init`, team rollout, update, removal |
| [Usage](docs/guide/usage.md) | the three modes, pausing and resuming, discovery and spec providers, what the reports mean |
| [Configuration](docs/guide/configuration.md) | `.factory/config.json`: models, review policy, validation commands, hooks, security |
| [Security and limitations](docs/guide/security.md) | what the guards do and do not do, permissions, known limits |
| [Troubleshooting](docs/guide/troubleshooting.md) | permission prompts, denied commands, invalid state, providers |
| [Testing](docs/guide/testing.md) | unit tests and behavioural evals |

Status: [final implementation report](docs/final-report.md) · Design: [architecture](docs/architecture.md) · [contracts](docs/contracts/README.md) · [decision records](docs/adr/) · [verification research](docs/research/claude-code-capabilities.md)

## Repository layout

```
.claude-plugin/marketplace.json   marketplace "ai-software-factory-kit"
plugins/factory/                  the plugin
  skills/{start,resume,init}/     entry points (/factory:start, /factory:resume, /factory:init)
  agents/                         4 workers + 2 reviewers
  hooks/                          hooks.json + factory-hook.mjs
  bin/                            factory-state, factory-install (on the Bash PATH)
  lib/                            deterministic core (state machine, DAG, classifier, installer, guards)
  core/                           schemas, defaults, runtime procedures and templates
  evals/                          behavioural eval suite (claude plugin eval)
tests/                            node:test suite (npm test)
docs/                             architecture, contracts, ADRs, guides, research
```
