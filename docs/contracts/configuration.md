# Contract: Configuration

Schema: `config.schema.json`. Defaults: `plugins/factory/core/defaults.json`. Loader: `lib/contracts.mjs` (`loadConfig`, `resolveConfig`, `resolveModel`).

## Resolution

1. Load `plugins/factory/core/defaults.json`.
2. If `.factory/config.json` exists, validate it against the schema. **If it is invalid, the Factory reports every error and uses defaults only**. It never applies a partially valid config.
3. Deep-merge the repo config over the defaults. Objects merge key by key. Arrays and scalars replace.
4. Run the semantic checks:
   - `fullSpec > standard`;
   - every enabled role has an `agent` and a `kind`;
   - at least one reviewer is enabled;
   - validation kinds exist.

A repo config needs only `{ "schemaVersion": 1 }` plus the keys it changes.

## Sections

| Section | Controls | Default highlights |
|---|---|---|
| `classification` | rubric thresholds, escalators, user confirmation | standard ≥ 5, fullSpec ≥ 12, escalate on `architecturalImpact = 2`, confirm when low confidence |
| `models.tiers` | alias per tier | `reasoning: opus`, `efficient: sonnet`, `light: haiku` |
| `roles` | role → agent, kind, model (tier, alias or `null`), enabled | the six built-in roles |
| `review` | iteration limit, per-mode policy, independence requirement | `maxIterations: 3` |
| `execution` | parallelism, concurrency, worktree policy, task retries | parallel on, 3 concurrent, worktrees opt-in, 2 attempts |
| `discovery` | provider, behaviour when unavailable | `grill-with-docs`, `ask` |
| `specification` | provider | `auto` |
| `validation` | repo commands and when they run | all commands `null` (unconfigured) |
| `hooks` | per-hook toggles | resume, command guard and manifest validation on; post-edit format off |
| `security` | protected paths, extra blocked commands, push policy | `.env*`, keys, secrets; `allowGitPush: false` |
| `artifacts` | whether workflows are committed | `false` |

## Model routing

- `resolveModel(config, role)` returns the alias to pass as the Agent tool's `model` parameter, or `null`. With `null`, the agent's frontmatter default applies.
- Only aliases (`opus`, `sonnet`, `haiku`, `fable`) are accepted, because that is all the per-call parameter accepts. The list lives once, in `common.schema.json#/$defs/modelAlias`.
- What actually runs can still differ: `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` and the org's `availableModels` take precedence. Reports record the *requested* alias.

## Validation commands

- The Factory never guesses commands. `init` proposes values detected from `package.json` scripts, `Makefile`, `pyproject.toml` and similar, and the user approves them.
- An unconfigured kind is reported as `skipped` with the reason "not configured". It is never reported as `passed`.

## Permissions

Claude Code permissions are **not** part of this file. The Factory respects whatever `settings.json` allows. `init` can *propose* additive deny rules (for example `Read(./.env)`, `Bash(git push *)`), which the user approves before they are merged (installation.md).
