[English](usage.md) · **Português (Brasil)**

# Uso

Para exemplos completos com cada comando que você digita, veja os [casos de uso](use-cases.pt-br.md) e o [passo a passo em monorepo](monorepo-walkthrough.pt-br.md).

## Inicie um workflow

```text
/factory:start <pedido de desenvolvimento>
/factory:start --mode standard <pedido>     # força um modo; o motivo é registrado
```

1. O orquestrador (o Claude, na sua conversa principal) cria um workflow em `.factory/workflows/<id>/`.
2. Ele inspeciona o código relevante e pontua dez dimensões da rubrica (0-2 cada, com evidências).
3. O `factory-state classify` calcula o modo:
   - QUICK abaixo de 5;
   - STANDARD a partir de 5;
   - FULL-SPEC a partir de 12, ou sempre que `architecturalImpact` tiver nota 2.
4. Você vê o modo e o motivo. Se a confiança for baixa, você é solicitado a confirmá-lo.

O slash command precisa estar no **início** da sua mensagem. Caso contrário, nenhuma skill é executada.

## Os três modos

Diagramas passo a passo de cada modo estão em [diagramas de workflow](workflows.pt-br.md).

| Modo | Fluxo | Revisões (padrão) |
|---|---|---|
| QUICK | implementar → validar → relatório | revisão de código apenas se uma dimensão de risco tiver nota 2 |
| STANDARD | plano (`plan.md`, DAG de tarefas) → workers em paralelo onde seus escopos de arquivos não se sobrepõem → validar → revisar → retrabalho (no máximo 3 rodadas) → integrar → validação final → relatório | revisão de código sempre; revisão de arquitetura em caso de risco |
| FULL-SPEC | discovery → especificação → plano → revisão de arquitetura do plano → execução STANDARD contra os IDs de requisitos da spec | revisões de código e de arquitetura sempre |

Os **workers** rodam como subagentes, com um brief que lista seus arquivos, critérios de aceite e comandos de validação:
- `factory:frontend-worker`;
- `factory:backend-worker`;
- `factory:qa-worker`;
- `factory:devops-worker` (nunca faz deploy).

Por padrão usam Sonnet. Os **revisores** (`factory:code-reviewer`, `factory:architecture-reviewer`) usam Opus por padrão e nunca revisam o próprio trabalho. Altere os modelos em [configuração](configuration.pt-br.md).

## Pausar e retomar

Um workflow para e diz exatamente o que precisa quando:
- precisa da sua resposta ou aprovação;
- precisa de uma sessão de discovery;
- falta uma dependência externa;
- as rodadas de revisão se esgotaram (escalonamento).

A espera é registrada como `blockedOn` no manifest.

```text
/factory:resume                                   # o único workflow ativo
/factory:resume wf-20261110-order-filters sim, use a API existente
```

- A retomada funciona em uma nova sessão, porque o estado fica em arquivos, não na conversa.
- Tarefas interrompidas (`running` quando uma sessão terminou) são conferidas contra `git status` / `git diff` antes de serem tentadas de novo.
- No início da sessão, um hook lista os workflows inacabados. O Claude os menciona, mas não os retoma por conta própria.
- **Para abandonar um workflow,** por exemplo para reformular o pedido, peça ao Claude para cancelá-lo, ou execute `factory-state transition <id> cancelled --reason "…" --user-approved`. Workflows cancelados são finais e deixam de aparecer como ativos. O código já alterado permanece na árvore de trabalho.

## FULL-SPEC: discovery e especificação

- **Discovery.** Com o `/grill-with-docs` instalado, o workflow pausa e pede que você digite `/grill-with-docs` (só você pode iniciar essa skill). Responda às perguntas até ela terminar e então execute `/factory:resume`.
  - A Factory confere as evidências: mudanças em `GLOSSARY.md` e nos ADRs desde o início do workflow, mais um `discovery-summary.md` sem perguntas bloqueantes.
  - Sem a skill, `discovery.whenUnavailable` decide: `ask` (padrão), `native` (o próprio orquestrador entrevista você) ou `stop`.
- **Especificação.**
  - Com o Spec Kit 1.x inicializado, o workflow usa `speckit-specify`, `speckit-clarify` e `speckit-plan`. A Factory adiciona escopo, NFRs e um mapeamento de critérios de aceite no `plan.md`.
  - Caso contrário, usa seu template local (`spec.md` com IDs `FR-n`, `NFR-n` e `AC-n`).
  - Em ambos os casos, `factory-state spec-check` precisa passar antes do planejamento, e todo requisito funcional precisa ser coberto por uma tarefa.

## O que você recebe no final

`.factory/workflows/<id>/final-report.md`, que cobre:
- o que mudou, arquivo por arquivo;
- os resultados de validação: cada comando como passou, falhou ou foi pulado, com o motivo. "Não configurado" nunca aparece como passou;
- os resultados das revisões, e se cada revisão foi independente;
- issues em aberto com sua severidade;
- qualquer coisa que o orquestrador precisou fazer por conta própria.

O workflow nunca faz commit, push ou deploy. Ele diz o que está pronto e deixa isso com você.

## Após a conclusão: follow-ups

Um workflow pode terminar com issues em aberto, por exemplo achados de revisão que não eram obrigatórios. Eles ficam registrados no manifest (`factory-state show <id>`) e listados no relatório final com um pedido pronto para colar.

- Um workflow `completed` é final. O `/factory:resume` não o reabre.
- **Para corrigir os follow-ups com a Factory**, faça commit (ou stash) da mudança concluída primeiro, para que o diff do novo workflow contenha só as correções. Depois inicie um novo workflow que os cite, por exemplo `/factory:start Corrigir as issues I1, I2 do workflow wf-…: …`. Ele é classificado como qualquer pedido, geralmente QUICK. Você ganha validação, os guards e, quando o risco pede, uma revisão.
- **Para corrigi-los sem a Factory**, peça diretamente ao Claude, sem slash command. Isso serve para mudanças pequenas, mas nenhum workflow está ativo: nada é rastreado, os guards ficam inativos e não há revisão independente.

## Inspecionando o estado você mesmo

Estes comandos são somente leitura, dentro do Claude Code ou a partir de um terminal via `<plugin>/bin/factory-state`:

```bash
factory-state list                  # todos os workflows
factory-state show [ID]             # resumo + próxima ação
factory-state validate [ID]         # validade do manifest e da config
factory-state config                # configuração efetiva
factory-state providers             # detecção do /grill-with-docs e do Spec Kit
```

Nunca edite o `manifest.json` à mão. O hook de guard bloqueia isso durante workflows, e o `factory-state` se recusa a carregar um manifest inválido.
