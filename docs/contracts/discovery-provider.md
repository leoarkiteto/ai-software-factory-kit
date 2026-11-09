# Contract: Discovery Provider

Applies to FULL-SPEC workflows. Decision record: ADR-0005.

Discovery establishes **shared understanding**: domain context, existing behaviour, vocabulary, constraints, decisions and architectural context. It does **not** produce the formal specification; that is the specification provider's job (specification-provider.md).

## 1. When discovery begins

After classification selects `full_spec` **and** the orchestrator has inspected the repository and existing docs (status `discovering`). Discovery never starts before that inspection, because its brief must contain what the codebase already answers.

## 2. Inputs: `discovery-brief.md`

Written by the Factory before handing over:

| Section | Content |
|---|---|
| Objective | The user's request, verbatim, plus a one-paragraph restatement |
| Already known from the repository | Facts found during inspection, with file references, so they are not asked again |
| Existing domain docs | Paths to `GLOSSARY.md` / `GLOSSARY-MAP.md`, `docs/adr/`, other relevant docs |
| Open questions | Behaviour or domain decisions the code cannot answer, grouped by dependency |
| Constraints and assumptions | Known technical, business or compliance limits |
| Out of scope (tentative) | To be confirmed or corrected during discovery |

## 3. Providers

### 3.1 `grill-with-docs` (preferred)

**Detection, in order.** The first hit wins and its path is recorded:

1. Project: `.claude/skills/grill-with-docs/SKILL.md`
2. User: `~/.claude/skills/grill-with-docs/SKILL.md` (skills.sh installs symlink here from `~/.agents/skills/`)
3. Plugin: an enabled `mattpocock-skills` plugin, invoked as `/mattpocock-skills:grill-with-docs`

Detection also checks that its dependency skills `grilling` and `domain-modeling` resolve in the same scope, and reports a partial install as unavailable.

**Invocation.** The skill declares `disable-model-invocation: true`, so the Factory **cannot** invoke it. The Factory:

1. Writes `discovery-brief.md`.
2. Sets `providers.discovery = { requested: "grill-with-docs", used: null, status: "pending" }` and `blockedOn = { kind: "discovery_session", ... }`.
3. Tells the user exactly what to type, for example `/grill-with-docs` followed by `@.factory/workflows/<id>/discovery-brief.md`. Hands control back.
   *To verify in Phase 5:* the skill has no `$ARGUMENTS` placeholder, so Claude Code appends `ARGUMENTS: <text>`. Whether an `@file` mention in that position attaches the brief must be confirmed. If it does not, the brief is already in the session context, because the Factory wrote it in the same conversation.

**Running.** The grilling session is owned entirely by the skill: rounds of questions, the user's answers, inline `GLOSSARY.md` and ADR writes. The Factory does not interleave its own questions.

**Completion criteria.** All must hold:

1. The skill reported that its design-tree frontier is empty, **and** the user confirmed shared understanding (the skill's own completion rule).
2. The user resumes the Factory (for example `/factory:resume`).
3. The Factory has written `discovery-summary.md` (§4).
4. No item in the summary's *Blocking open questions* remains. Otherwise the workflow stays in `discovering`.

The Factory then records `used: "grill-with-docs"`, `status: "completed"`, and an `evidence` string citing what changed (from `git diff --stat` on `GLOSSARY*.md` and `docs/adr/`). If nothing changed and the user did not confirm a session took place, the Factory must not record `used: "grill-with-docs"`.

### 3.2 `native` (fallback)

A Factory skill (`factory:discover`, Phase 5) that follows the same contract:

- Progressive rounds of numbered questions, each with a recommended answer.
- Facts are looked up in the repository, never asked of the user.
- It writes `GLOSSARY.md` and ADRs only if the repository already uses them, or if the user agrees to start them.

It is deliberately simpler than `grill-with-docs` and is recorded as `used: "native"`.

## 4. Output: `discovery-summary.md`

Written by the Factory after any provider finishes. It is the **only** discovery input the specification stage consumes, alongside the referenced docs.

| Section | Content |
|---|---|
| Provider | Which provider ran, plus evidence |
| Decisions | Each decision with its rationale, linking ADRs where created |
| Vocabulary | Terms resolved or changed (links to `GLOSSARY.md` entries; no copies) |
| Behaviour | Agreed behaviour, including edge cases discussed |
| Constraints and assumptions | Final list |
| Scope | In / out, as agreed |
| Non-blocking open questions | Deferred to specification with a default |
| Blocking open questions | Must be empty to leave `discovering` |
| Docs changed | Paths created or modified during discovery |

## 5. Missing or unavailable provider

Governed by `discovery.whenUnavailable`:

| Value | Behaviour |
|---|---|
| `ask` (default) | Explain what is missing, how to install it (`claude plugin install mattpocock-skills@claude-plugins-official`, or skills.sh), and offer: install and retry, use native fallback, or stop |
| `native` | Use the native fallback and say so in the session and the final report |
| `stop` | Set `status: failed` with the reason |

In every case `providers.discovery.status = "unavailable"` is recorded before any fallback. The final report states which mechanism produced the discovery artifacts.

## 6. Extending

A new provider must define detection, invocation (model-invocable or user-invoked), completion criteria, and how its outputs map onto §4. Adding one requires a new enum value in `config.schema.json#/properties/discovery/properties/provider` and an adapter section in the discovery skill. Nothing in the workflow engine changes.
