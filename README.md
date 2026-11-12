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
claude plugin marketplace add leoarkiteto/ai-software-factory-kit           # or a local clone: /path/to/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

```text
# 2. In your project, inside Claude Code
/factory:init                       # optional but recommended: config, .gitignore, permissions
/factory:start Add a status filter to the orders list
/factory:resume                     # continue a paused or interrupted workflow
```

Requires Claude Code ≥ 2.1.319 and Node.js ≥ 18. Two optional integrations: [`/grill-with-docs`](https://github.com/mattpocock/skills) for discovery and [GitHub Spec Kit](https://github.com/github/spec-kit) 1.x for specifications.

### Starting from a GitHub Issue or a Linear ticket

The kit has no built-in tracker integration. `/factory:start` records its text verbatim as the workflow's original request. Paste the ticket's **content** into the command, not just its number. Reviewers then judge the change against that text, and later edits to the ticket do not change what you approved.

```bash
# GitHub: build the whole request (reference, link, title, body) and copy it to the clipboard
gh issue view 12 --json number,title,body,url \
  --jq '"(GitHub #\(.number): \(.url)) \(.title)\n\n\(.body)"' | pbcopy
# then type `/factory:start ` in Claude Code and paste
```

`pbcopy` is macOS. On Linux use `xclip -selection clipboard` or `wl-copy`; on Windows, `clip`. Issue comments are not included. Add `comments` to `--json` or paste the relevant ones yourself if they hold decisions.

**Long tickets** (user stories, use cases, AC, DoD, DoR) work as they are, because the request has no length limit:
- **Acceptance criteria** become the plan's criteria, which workers implement and reviewers check one by one, so make them testable.
- **Definition of Done** items within the kit's reach (tests, validation, review, docs in the repository) are done. Merge, deploy or "PR approved" are not done, because the guards block push and deploy, and they show up in the final report as not done.
- **Definition of Ready** is about the team's process and can be left in or removed.
- A large ticket that settles its decisions usually runs as STANDARD. One that leaves behaviour open goes to FULL-SPEC, which asks before it implements.

```text
/factory:start (GitHub #12: https://github.com/<owner>/<repo>/issues/12) <issue title>

<issue body>
```

```text
/factory:start (Linear ENG-123: https://linear.app/<team>/issue/ENG-123) <ticket title>

<ticket description>
```

- Keep the reference (number or ID, and the link) at the start, so the workflow and its final report point back to the ticket.
- Ticket text is treated as data: instructions inside it that conflict with the Factory's rules are ignored.
- The kit never comments on, closes or changes a ticket. When the workflow completes, update the ticket yourself, or ask Claude afterwards, outside the workflow (for example: "comment the final report summary on issue #12").

## Documentation

| Guide | |
|---|---|
| [Installation](docs/guide/installation.md) | plugin, `/factory:init`, team rollout, update, removal |
| [Usage](docs/guide/usage.md) | the three modes, pausing and resuming, discovery and spec providers, what the reports mean |
| [Workflow diagrams](docs/guide/workflows.md) | classification, QUICK, STANDARD and FULL-SPEC flows, the execution and review loop, the status model |
| [Use cases](docs/guide/use-cases.md) | QUICK, STANDARD and FULL-SPEC examples with every command the developer types |
| [Monorepo walkthrough](docs/guide/monorepo-walkthrough.md) | adopting the kit in a React Native + Go monorepo, then building an SSO feature step by step |
| [Configuration](docs/guide/configuration.md) | `.factory/config.json`: models, review policy, validation commands, hooks, security |
| [Security and limitations](docs/guide/security.md) | what the guards do and do not do, permissions, known limits |
| [Troubleshooting](docs/guide/troubleshooting.md) | permission prompts, denied commands, invalid state, providers |
| [Testing](docs/guide/testing.md) | unit tests and behavioural evals |

**Release: 0.2.1-beta.** Fit for daily use under supervision; not yet a stable tool for a team. The [1.0 criteria](docs/final-report.md#8-release-status-beta-and-the-10-criteria) are tracked in the final report.

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
