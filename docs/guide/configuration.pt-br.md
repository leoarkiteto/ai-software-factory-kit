[English](configuration.md) · **Português (Brasil)**

# Configuração

Por repositório: `.factory/config.json`. Todas as seções são opcionais; valores omitidos vêm de `plugins/factory/core/defaults.json`. Schema: `plugins/factory/core/schemas/config.schema.json`. Contrato de referência: [configuration.md](../contracts/configuration.md) (em inglês).

Uma config precisa apenas da versão do schema mais o que você alterar:

```json
{
  "schemaVersion": 1,
  "validation": {
    "commands": { "lint": "npm run lint", "typecheck": "npm run typecheck", "test": "npm test", "build": "npm run build" }
  }
}
```

Confira com `factory-state config`. **Uma config inválida nunca é aplicada parcialmente.** A Factory reporta cada erro e usa os defaults, e um hook sinaliza o problema logo depois que você edita o arquivo.

## Alterações comuns

**Comandos de validação.** Sem eles, as verificações são reportadas como `skipped: not configured`, nunca como aprovadas.

```json
"validation": {
  "commands": { "format": "npx prettier --write {file}", "lint": "npm run lint", "test": "npm test", "build": null },
  "preReview": ["lint", "typecheck", "test"],
  "final": ["lint", "typecheck", "test", "build"],
  "timeoutSeconds": 600
}
```

**Modelos.** O `model` de um papel pode ser um tier (`reasoning`, `efficient`, `light`), um alias (`opus`, `sonnet`, `haiku`, `fable`) ou `null` (o padrão do próprio agente).

```json
"models": { "tiers": { "reasoning": "opus", "efficient": "sonnet", "light": "haiku" } },
"roles": { "qa-worker": { "model": "light" }, "devops-worker": { "enabled": false } }
```

**Classificação.**

```json
"classification": { "thresholds": { "standard": 5, "fullSpec": 12 }, "escalateToFullSpecWhenMax": ["architecturalImpact"], "confirmWithUser": "when_low_confidence" }
```

`confirmWithUser` aceita um destes:
- `always`;
- `never`;
- `when_not_quick`;
- `when_low_confidence`.

**Política de revisão.** Por modo, cada valor é `never`, `on_risk` (uma dimensão de risco teve nota 2) ou `always`.

```json
"review": {
  "maxIterations": 3,
  "code": { "quick": "on_risk", "standard": "always", "full_spec": "always" },
  "architecture": { "quick": "never", "standard": "on_risk", "full_spec": "always" },
  "requireIndependentReviewer": true
}
```

**Execução.**

```json
"execution": { "parallel": true, "maxConcurrentTasks": 3, "worktreeIsolation": "never", "maxTaskAttempts": 2 }
```

`worktreeIsolation` é `never` na v0.1: worktrees partem da base commitada e não enxergam pré-requisitos não commitados (ADR-0007).

**Provedores.**

```json
"discovery": { "provider": "grill-with-docs", "whenUnavailable": "ask" },
"specification": { "provider": "auto" }
```

- `whenUnavailable` é `ask`, `native` ou `stop`.
- `specification.provider` é `auto` (Spec Kit quando detectado, senão local), `spec-kit` ou `local`.

**Hooks e segurança.**

```json
"hooks": { "sessionResume": true, "commandGuard": true, "manifestValidation": true, "postEditFormat": false },
"security": {
  "protectedPaths": [".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*"],
  "blockedCommands": ["^make\\s+release\\b"],
  "allowGitPush": false
}
```

- `protectedPaths` substitui a lista padrão; não a estende.
- `blockedCommands` aceita regexes, comparadas com cada comando simples.
- `postEditFormat` executa `validation.commands.format` após cada edição durante um workflow. `{file}` representa o caminho editado.

Veja [segurança](security.pt-br.md) e o [contrato de hooks](../contracts/hooks.md) (em inglês).

**Artefatos.**

```json
"artifacts": { "commitWorkflows": false }
```

Com `false`, o `init` propõe ignorar `.factory/workflows/` no `.gitignore`.

## Regras de mesclagem

- Objetos são mesclados chave a chave.
- Arrays e escalares substituem o default. Por exemplo, definir `protectedPaths` substitui a lista padrão inteira.

Verificações semânticas:
- `fullSpec > standard`;
- todo papel habilitado tem um agente;
- pelo menos um revisor está habilitado;
- as listas de validação citam tipos conhecidos.
