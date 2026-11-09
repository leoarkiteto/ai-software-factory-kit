# Claude Code Capability Verification (Phase 1)

Date: 2026-11-09 · Claude Code 2.1.319 · Spec Kit (`specify`) 1.0.1

This document records which Claude Code and third-party capabilities the Factory depends on, and **how each was verified**. Later phases must only rely on items marked `runtime` or `docs`. Items marked `docs-summary` were read from a truncated page summary and must be re-checked before they become load-bearing.

| Evidence level | Meaning |
|---|---|
| `runtime` | Exercised in a real headless session against a probe plugin and fixture repo |
| `docs` | Quoted verbatim from code.claude.com documentation |
| `docs-summary` | From a model summary of a truncated documentation page |
| `source` | Read from the upstream source repository or installed files |

Sources: `code.claude.com/docs/en/{plugins-reference, plugin-marketplaces, plugins/components, sub-agents, skills, hooks, memory, settings, permissions, worktrees}`.

---

## 1. Plugins (distribution mechanism)

| Fact | Evidence |
|---|---|
| Manifest `.claude-plugin/plugin.json`; only `name` required (kebab-case) | docs, runtime |
| Default dirs at plugin root: `skills/<name>/SKILL.md`, `agents/`, `hooks/hooks.json`, `bin/`, `.mcp.json`, `settings.json`, `output-styles/`, `workflows/` | docs |
| `bin/` executables are on the Bash tool's `PATH` while the plugin is enabled | runtime |
| Skills are namespaced `/<plugin>:<skill>`; agents `<plugin>:<agent>` | runtime |
| `${CLAUDE_PLUGIN_ROOT}` is substituted inline in skill/agent Markdown | runtime |
| Hook processes receive `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_DATA` | runtime |
| `CLAUDE_PLUGIN_ROOT` changes on update (do not store state there); `CLAUDE_PLUGIN_DATA` (`~/.claude/plugins/data/<id>/`) persists across updates | docs, runtime (path observed) |
| These env vars are **not** present in Bash tool commands | docs |
| **Plugins cannot ship rules or CLAUDE.md content.** A plugin-root `CLAUDE.md` is not loaded; guidance must live in skills | docs |
| Plugin `settings.json` only honours `agent` and `subagentStatusLine` | docs |
| Plugin hooks register when the session loads the plugin and fire on **every** matching event in that session | docs, runtime |
| Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` | docs |
| `marketplace.json` may live in the same repo; plugin `source: "./"` or `"./plugins/x"` | docs, runtime |
| Dev loop: `claude plugin validate [--strict] <dir>`, `claude --plugin-dir <dir>`, `/reload-plugins`, `claude plugin marketplace add ./path`, `claude plugin install p@m` | runtime (`validate`, `--plugin-dir`), docs (rest) |
| `claude plugin eval` runs eval cases (`evals/**/case.yaml` or `prompt.md` + `graders/*.md`) against a plugin with a no-plugin baseline | CLI `--help` |
| The plugin directory listing requires README + LICENSE (not needed for private marketplaces) | runtime (`validate` output) |

## 2. Subagents

| Fact | Evidence |
|---|---|
| Frontmatter: `name`, `description` (required); `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`, `autoCompactWindow` | docs |
| Unknown frontmatter fields are **silently ignored** — a validator is needed | docs |
| `model`: alias (`sonnet`, `opus`, `haiku`, `fable`), full ID, or `inherit` | docs |
| Model precedence: Agent-call `model` param (aliases only) → frontmatter `model` → `CLAUDE_CODE_SUBAGENT_MODEL` → main model. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides everything | docs |
| Per-call `model: "haiku"` on a plugin agent ran on Haiku | runtime |
| Values are checked against an org `availableModels` allowlist | docs |
| **Subagents can spawn subagents** (default max depth 3; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`). Prevent by omitting `Agent` from `tools` | docs-summary |
| Concurrency cap default 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) | docs-summary |
| Scope priority: managed > `--agents` > `.claude/agents/` > `~/.claude/agents/` > plugin `agents/` | docs |

> **Correction to the initial assessment:** the assessment stated that subagents cannot spawn subagents. That is outdated; nesting is supported. The decision to run the orchestrator in the main thread stands, but for different reasons (see ADR-0003).

## 3. Skills

| Fact | Evidence |
|---|---|
| Frontmatter includes `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `hooks`, `paths` | docs-summary |
| `disable-model-invocation: true` → the Skill tool call is **blocked** if the model tries; the skill is also removed from context and cannot be preloaded into subagents | docs |
| No skill-dependency / "requires" mechanism exists | docs (absence) |
| Substitutions: `$ARGUMENTS`, `$N`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`; `` !`cmd` `` dynamic injection (aborts invocation on non-zero exit; subject to permissions) | docs |
| Locations: personal `~/.claude/skills/`, project `.claude/skills/`, nested, plugin (namespaced, never conflict); personal beats project | docs |

## 4. Hooks

| Fact | Evidence |
|---|---|
| 33 events incl. `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SubagentStart`, `SubagentStop`, `Stop`, `PreCompact`, `WorktreeCreate`, `SessionEnd` | docs |
| Handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`; fields `if` (one permission rule), `timeout`, `once`, `args`, `async`, `onFailure` (≥2.1.295) | docs |
| Hooks from all scopes **merge**; identical handlers run once | docs |
| SessionStart stdout on exit 0 is injected into context | runtime |
| Exit 2 = blocking (stderr is reason); PreToolUse `hookSpecificOutput.permissionDecision` ∈ `allow/deny/ask/defer`; silence does not approve | docs-summary (exit codes), docs (silence) |
| In worktrees, `CLAUDE_PROJECT_DIR` stays at the main checkout; use stdin `cwd` | docs |

## 5. Memory, rules, settings

| Fact | Evidence |
|---|---|
| `.claude/rules/**/*.md` supported; optional `paths:` glob frontmatter (only field read); user-level `~/.claude/rules/` supported | docs |
| `@path` imports in CLAUDE.md (max depth 4; external paths need approval); `CLAUDE.local.md` supported | docs |
| Settings precedence: managed > CLI `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`; permission arrays **combine** across scopes | docs |
| Rule order deny → ask → allow; syntax `Bash(git push *)`, `Read(./.env)`; a Read deny also blocks Edit/Write | docs |
| Project `permissions.allow` waits for workspace trust; deny/ask apply immediately | docs |
| `enabledPlugins` / `extraKnownMarketplaces` exact shapes | **not verified** |

## 6. Worktrees (parallel isolation)

| Fact | Evidence |
|---|---|
| `isolation: worktree` (frontmatter or Agent-call param) creates a fresh checkout | docs |
| **Base is the remote default branch** (`worktree.baseRef: "fresh"`), not the session HEAD. `"head"` uses local HEAD (commits only) | docs |
| Uncommitted main-checkout changes are therefore not visible to an isolated worker | inference from docs |
| Worktrees with changes are kept on disk; branch name/path return and merge are **not documented** | docs (absence) |
| Isolated subagents do not load the worktree's own CLAUDE.md / `.claude/rules/` | docs |

## 7. Third-party integrations

### `/grill-with-docs` (mattpocock/skills)

| Fact | Evidence |
|---|---|
| Installed on this machine via skills.sh at `~/.agents/skills/` symlinked into `~/.claude/skills/` (user scope, un-namespaced). Also available as plugin `mattpocock-skills@claude-plugins-official` (namespaced `/mattpocock-skills:grill-with-docs`) | source (`~/.agents/.skill-lock.json`) |
| `grill-with-docs` has `disable-model-invocation: true` — **only the user can start it** | source |
| Its body only says to call skills `grilling` and `domain-modeling`; both are model-invocable | source |
| Outputs: `GLOSSARY.md` (or `GLOSSARY-MAP.md` for multi-context repos) and `docs/adr/NNNN-slug.md`, created lazily | source |
| Completion: design-tree frontier empty **and** user confirms shared understanding | source |
| `architecture.md` refers to `CONTEXT.md`; upstream now uses `GLOSSARY.md` | source |

### GitHub Spec Kit 1.0.1

| Fact | Evidence |
|---|---|
| `specify init --here --integration claude --non-interactive` works offline | runtime (scratch dir) |
| Installs **skills** (not `/speckit.*` commands) in `.claude/skills/`: `speckit-{specify,clarify,plan,tasks,analyze,checklist,constitution,converge,implement,taskstoissues}`, all model-invocable | runtime |
| Writes `.specify/` (templates, bash scripts, `memory/constitution.md`, `workflows/speckit/workflow.yml`, `init-options.json` with `speckit_version`) | runtime |
| Core scripts do not create git branches in 1.0.1 (branching lives in an optional git extension); active feature tracked via `.specify/feature.json` / `SPECIFY_FEATURE` | runtime (script inspection) |
| `speckit-tasks` / `speckit-implement` overlap with the Factory orchestrator | runtime (skill list) |

---

## 8. Runtime findings from Phase 4 scenarios

| Fact | Evidence |
|---|---|
| A user-invocable plugin skill runs in `claude -p` when the prompt starts with `/<plugin>:<skill> args` | runtime |
| `!`factory-state …`` dynamic context injection works in plugin skills (plugin `bin/` is on PATH there too) | runtime |
| Skill `allowed-tools: Edit(/.factory/**)` (and `Edit(.factory/**)`) auto-allows Write inside `.factory/` while other paths still prompt; `Write(.factory/**)` does **not** | runtime |
| Heredoc bodies containing JSON are denied even with `Bash(factory-state *)` allowed; plain-text heredocs (quotes, `$`, backticks, globs, `===`) pass | runtime |
| Compound commands (`X=…; cmd`, `cd … && cmd`, `cmd; echo $?`) are denied when any part is not allowed | runtime |
| A fresh session can resume a workflow purely from `.factory/` state | runtime |
| Skill `allowed-tools` stop applying after delegated subagents return within the same invocation: later `factory-state` and `.factory/` writes were denied | runtime (Phase 5) |
| Multiple Agent tool calls in one assistant message run plugin agents in parallel | runtime (Phase 5) |
| `${CLAUDE_PLUGIN_ROOT}` is substituted inside plugin agent bodies (workers read the shared contract) | runtime (Phase 5) |
| Per-call `model` on plugin agents is honoured (`sonnet` workers, `opus` reviewers) | runtime (Phase 5) |
| Subagent worktree: `.claude/worktrees/agent-<id>`, branch `worktree-agent-<id>`, reported as `worktreePath`/`worktreeBranch`; main-checkout uncommitted files absent; worker changes left uncommitted in the worktree | runtime (Phase 5) |

## 9. Implications carried into Phase 2

1. Kit = plugin; per-repo files (config, rules, CLAUDE.md snippet) need an explicit, approval-gated `init` step (ADR-0001).
2. Deterministic logic ships in `bin/` (ADR-0002).
3. Plugin hooks are always-on → every hook must exit 0 silently unless `.factory/` exists and a workflow is active.
4. Agent frontmatter is silently permissive → the kit validates its own agent/skill frontmatter in tests.
5. Model routing via Agent-call `model` aliases (ADR-0004).
6. Discovery must pause for the user to type `/grill-with-docs` (ADR-0005).
7. Spec Kit is an optional provider limited to specify/clarify/plan (ADR-0006).
8. Worktree isolation only suits tasks whose prerequisites are committed (ADR-0007).
9. `architecture.md` corrections: `CONTEXT.md` → `GLOSSARY.md`; Spec Kit is an alternative spec provider, not a sequential step.

## 10. Open verification items

- `enabledPlugins` / `extraKnownMarketplaces` shapes (needed for team rollout docs, Phase 8).
- Hook exit-code/JSON semantics and Stop/SubagentStop stdin schema (re-check before Phase 7).
- Skill frontmatter table verbatim (re-check before Phase 4).
