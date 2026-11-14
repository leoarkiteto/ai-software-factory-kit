[English](testing.md) · **Português (Brasil)**

# Testes

O kit é testado em três níveis. Cada um diz algo diferente sobre se ele funciona.

## 1. Testes determinísticos: `npm test`

- **O que roda:** cerca de 136 testes `node:test` sem dependências, offline e gratuitos, em poucos segundos.

| Arquivo | Cobre |
|---|---|
| `tests/contracts.test.mjs` | schemas, resolução da config, roteamento de modelos, verificações de relatórios |
| `tests/glob.test.mjs`, `tests/classify.test.mjs` | sobreposição de globs, rubrica e seleção de modo, política de revisão |
| `tests/state.test.mjs` | máquina de estados por modo, guards, DAG, escalonamento, novas tentativas, ciclo de revisão |
| `tests/spec.test.mjs` | completude de spec e de discovery (local e Spec Kit) |
| `tests/cli.test.mjs` | `factory-state` de ponta a ponta contra uma cópia instalada do plugin |
| `tests/hooks.test.mjs` | regras do guard, inércia, chaves liga/desliga, hooks de validação, o ponto de entrada do hook instalado, com payloads sintéticos |
| `tests/installer.test.mjs` | inspect, plan, apply vinculado ao hash, conflitos, idempotência, atualização, remoção, CLI `factory-install` |
| `tests/plugin.test.mjs` | frontmatter de skills e agentes, referências de guias, nenhum caminho do plugin fixo no código |
| `tests/evals.test.mjs` | estrutura da suíte de evals e sincronização das fixtures |

Execute também `claude plugin validate .` (manifest e marketplace) e `node scripts/sync-eval-fixtures.mjs --check`.

- **O que eles provam:** o núcleo determinístico faz o que os contratos dizem.
- **O que eles não provam:** como um modelo se comporta ao seguir as skills.

## 2. Evals comportamentais: `claude plugin eval`

A suíte fica em `plugins/factory/evals/`, um diretório por caso. Todo caso parte do mesmo scaffold, um repositório Node minúsculo; alguns também recebem um workflow ativo. A fonte da fixture é `evals/fixtures/scaffold.sh`. Copie-a para cada caso com `node scripts/sync-eval-fixtures.mjs`, porque os scripts de scaffold precisam ficar dentro do seu caso.

```bash
cd plugins/factory
claude plugin eval . --tag smoke --allow-tools Bash Read Glob Grep \
  --model sonnet --judge-model haiku --ablation none --scaffold --trust-plugin --max-cost-usd 1.5
```

| Caso | Tag | Verifica |
|---|---|---|
| `guard-blocks-push` | smoke | Com um workflow ativo, `git push` é negado pelo "Factory guard", e o modelo reporta isso sem contorná-lo |
| `hooks-silent-without-workflow` | smoke | Sem um workflow, os hooks nunca interferem, mesmo com `git branch -D` |
| `session-notice-no-auto-resume` | smoke | O aviso do SessionStart chega ao modelo. Ele cita o workflow e o `/factory:resume`, e não altera estado algum |
| `init-plan-before-writing` | needs-bin | O `/factory:init` inspeciona e planeja, não escreve nada e mostra as regras de allow literalmente |
| `quick-workflow-fix` | needs-bin | Um workflow QUICK real corrige um bug, roda `npm test`, conclui o workflow e reporta com honestidade, sem commit |

**Resultados em 2026-11-10** (Claude Code 2.1.321, Sonnet com juiz Haiku, 2 execuções por caso):
- **smoke:** 3/3 casos e 6/6 execuções passaram, por US$ 0,29.
- **needs-bin:** estes casos não podem rodar sob `claude plugin eval` hoje. Nas sessões de eval, o diretório `bin/` do plugin não está no PATH do Bash, embora esteja para um plugin instalado. `factory-state` e `factory-install` não são encontrados, e o modelo corretamente para sem escrever nada. Os hooks não são afetados porque chamam `node "${CLAUDE_PLUGIN_ROOT}/…"`. Definir `env.PATH` em um `.claude/settings.json` do scaffold não ajudou. Rode estes casos de novo quando o harness de eval expuser o `bin/` do plugin.

## 3. Cenários em sessões reais

As fases 4 a 6 rodaram o plugin instalado, em sessões headless `claude -p`, contra repositórios descartáveis. A fase 9 o rodou em um projeto real (um app Go + templ + HTMX + SQLite) para uma funcionalidade real, a fase 10 comparou provedores em um segundo projeto, e a fase 11 o rodou em um monorepo real (Expo/React Native + Go). Os logs, com custos, estão em `docs/research/` (em inglês).

| Exercitado de verdade | Apenas em testes determinísticos até agora |
|---|---|
| QUICK de ponta a ponta no modo de permissão padrão, sem negações | um escalonamento após 3 rodadas de revisão |
| STANDARD com workers em paralelo, uma sessão interrompida e recuperação | falha → nova tentativa → replanejamento |
| Um ciclo de revisão com um defeito plantado: NEEDS_CHANGES → retrabalho → APPROVED | o fallback nativo de discovery; `/grill-with-docs` indisponível |
| FULL-SPEC: `/grill-with-docs` (2 rodadas), spec do Spec Kit, revisão de arquitetura do plano, worker de QA, revisões de código e arquitetura em paralelo | Spec Kit e o provedor local no mesmo repositório |
| FULL-SPEC em um projeto real: provedor de spec local, revisão do plano NEEDS_CHANGES → APPROVED, worker de frontend, uma negação do guard resolvida pelo usuário | |
| STANDARD em um projeto real: o classificador passando de FULL-SPEC para STANDARD quando as decisões estão explícitas no pedido | |
| QUICK em um projeto real: implementação na thread principal, uma pausa para aprovação do usuário no meio da execução, sem revisão sob `on_risk` | |
| FULL-SPEC com e sem os provedores em um segundo projeto real, recuperação após interrupções por limite de uso | |
| O guard, a inércia e o aviso de retomada (evals acima) | o worker de devops; `/factory:init` em uma sessão real; uma negação de hook sob `bypassPermissions` |

Foram execuções únicas. Elas mostram que os procedimentos podem funcionar de ponta a ponta, não com que frequência funcionam.

**Contando o custo.** Com `claude -p --resume`, os campos `total_cost_usd` e `modelUsage` de `--output-format json` são **cumulativos para a sessão**, não para a invocação. O custo de uma sessão é o valor da sua última invocação. Não some os valores de uma mesma sessão. Em um plano de assinatura, isso é uma medida equivalente à API do consumo de cota, não uma cobrança.

**Contando negações.** O campo `permission_denials` de `claude -p --output-format json` lista apenas as negações da sessão principal. Negações dentro de subagentes (workers e revisores) não estão nele. Para auditar uma execução, procure nos transcripts dos subagentes em `~/.claude/projects/<project>/<session>/subagents/*.jsonl` por resultados de ferramentas que sejam erros.
