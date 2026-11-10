# Configuration

Per repository: `.factory/config.json`. Every section is optional; omitted values come from `plugins/factory/core/defaults.json`. Schema: `plugins/factory/core/schemas/config.schema.json`. Reference contract: [configuration.md](../contracts/configuration.md).

A config needs only the schema version plus what you change:

```json
{
  "schemaVersion": 1,
  "validation": {
    "commands": { "lint": "npm run lint", "typecheck": "npm run typecheck", "test": "npm test", "build": "npm run build" }
  }
}
```

Check it with `factory-state config`. **An invalid config is never partially applied.** The Factory reports every error and uses the defaults, and a hook flags the problem right after you edit the file.

## Common changes

**Validation commands.** Without them, checks are reported as `skipped: not configured`, never as passed.

```json
"validation": {
  "commands": { "format": "npx prettier --write {file}", "lint": "npm run lint", "test": "npm test", "build": null },
  "preReview": ["lint", "typecheck", "test"],
  "final": ["lint", "typecheck", "test", "build"],
  "timeoutSeconds": 600
}
```

**Models.** A role's `model` can be a tier (`reasoning`, `efficient`, `light`), an alias (`opus`, `sonnet`, `haiku`, `fable`) or `null` (the agent's own default).

```json
"models": { "tiers": { "reasoning": "opus", "efficient": "sonnet", "light": "haiku" } },
"roles": { "qa-worker": { "model": "light" }, "devops-worker": { "enabled": false } }
```

**Classification.**

```json
"classification": { "thresholds": { "standard": 5, "fullSpec": 12 }, "escalateToFullSpecWhenMax": ["architecturalImpact"], "confirmWithUser": "when_low_confidence" }
```

`confirmWithUser` takes one of:
- `always`;
- `never`;
- `when_not_quick`;
- `when_low_confidence`.

**Review policy.** Per mode, each value is `never`, `on_risk` (a risk dimension scored 2) or `always`.

```json
"review": {
  "maxIterations": 3,
  "code": { "quick": "on_risk", "standard": "always", "full_spec": "always" },
  "architecture": { "quick": "never", "standard": "on_risk", "full_spec": "always" },
  "requireIndependentReviewer": true
}
```

**Execution.**

```json
"execution": { "parallel": true, "maxConcurrentTasks": 3, "worktreeIsolation": "never", "maxTaskAttempts": 2 }
```

`worktreeIsolation` is `never` in v0.1: worktrees start from the committed base and do not see uncommitted prerequisites (ADR-0007).

**Providers.**

```json
"discovery": { "provider": "grill-with-docs", "whenUnavailable": "ask" },
"specification": { "provider": "auto" }
```

- `whenUnavailable` is `ask`, `native` or `stop`.
- `specification.provider` is `auto` (Spec Kit when detected, otherwise local), `spec-kit` or `local`.

**Hooks and security.**

```json
"hooks": { "sessionResume": true, "commandGuard": true, "manifestValidation": true, "postEditFormat": false },
"security": {
  "protectedPaths": [".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*"],
  "blockedCommands": ["^make\\s+release\\b"],
  "allowGitPush": false
}
```

- `protectedPaths` replaces the default list; it does not extend it.
- `blockedCommands` takes regexes, matched against each simple command.
- `postEditFormat` runs `validation.commands.format` after each edit during a workflow. `{file}` stands for the edited path.

See [security](security.md) and [hooks contract](../contracts/hooks.md).

**Artifacts.**

```json
"artifacts": { "commitWorkflows": false }
```

With `false`, `init` proposes ignoring `.factory/workflows/` in `.gitignore`.

## Merge rules

- Objects merge key by key.
- Arrays and scalars replace the default. For example, setting `protectedPaths` replaces the whole default list.

Semantic checks:
- `fullSpec > standard`;
- every enabled role has an agent;
- at least one reviewer is enabled;
- validation lists name known kinds.
