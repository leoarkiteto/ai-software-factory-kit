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

**Pesquisa.** Quando o trabalho depende de uma API de framework ou biblioteca que muda entre versões (por exemplo, cache no Next.js), o orquestrador pode antes enviar perguntas concretas ao `factory:research-worker`. Ele usa Haiku por padrão, apenas lê o repositório e a web, fixa as versões a partir do seu manifest e lockfile e devolve uma nota com as fontes. A nota é salva em `.factory/workflows/<id>/research/` e suas conclusões chegam aos workers pelos briefs; os próprios workers nunca usam a web. O Claude Code pede sua permissão para as buscas e acessos à web, como de costume. Se você usa o servidor MCP [Context7](https://github.com/upstash/context7), conecte o conector Context7 do claude.ai ou registre-o localmente com o nome `context7` (por exemplo `claude mcp add --transport http context7 https://mcp.context7.com/mcp`), e o pesquisador o usa para achar a API certa mais rápido; ele ainda confirma cada resposta na documentação oficial, porque o conteúdo do Context7 é mantido pela comunidade. O kit não instala o Context7. Para desligar a pesquisa, defina `"roles": { "research-worker": { "enabled": false } }`.

**Design (Figma ou screenshots).** Quando o seu pedido cita um link do Figma ou uma imagem do repositório, o orquestrador primeiro envia o `factory:design-worker` para lê-lo. Ele usa Sonnet por padrão, lê os frames pelo servidor MCP do Figma ou lê as imagens, mapeia o design para os tokens do seu tema e os componentes existentes e lista o que o design deixa de fora. A nota é salva em `.factory/workflows/<id>/design/`, os screenshots dos frames são baixados ao lado dela, e workers e revisores recebem os dois pelos briefs; os workers nunca chamam o Figma. O que saber:
- **Cite o design no pedido.** Um link do Figma com `node-id`, ou um caminho como `docs/design/orders-filter.png`. O kit não procura designs que você não citou. Uma imagem colada no chat não basta: o workflow pausa e pede que você a salve no repositório.
- **As lacunas voltam para você.** Um estado que falta (erro, loading, vazio) ou um asset faz o workflow perguntar; uma cor sem token no tema é mapeada ou ganha uma task, nunca fica fixa no código.
- **Figma.** Instale o plugin da Figma (`claude plugin install figma@claude-plugins-official`) ou adicione o servidor (`claude mcp add --transport http figma https://mcp.figma.com/mcp`). É preciso um seat Dev ou Full em plano pago; com seat View (20 chamadas por mês), exporte PNGs para o repositório. Sem as ferramentas do Figma, o workflow pede os PNGs exportados.
- **Sem conferência visual.** Nenhum agente roda o app para compará-lo com o design: o relatório final lista essa conferência para você fazer.

Para desligar, defina `"roles": { "design-worker": { "enabled": false } }`; os designs citados passam a ser lidos de PNGs exportados pelo próprio orquestrador.

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

## Diagramas no plano e na spec

Quando uma mudança abrange vários componentes, ou altera uma interface, uma máquina de estados ou um modelo de dados, o `plan.md` e o `spec.md` local ganham uma seção opcional `## Diagrams` com um a três diagramas [Mermaid](https://mermaid.js.org/). O GitHub, o VS Code e a maioria dos visualizadores de Markdown os exibem já desenhados. Mudanças pequenas não têm diagramas, e o QUICK não tem plano.

- Os diagramas são ilustrativos. O texto continua sendo o plano oficial: se um diagrama discordar dele, o texto vale e o diagrama é corrigido. No FULL-SPEC, o revisor de arquitetura confere cada diagrama com o texto durante a revisão do plano.
- Só são usados `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram` e `classDiagram`, sem estilização, para que os diagramas também sirvam de entrada para outras ferramentas.

**Versão interativa (opcional).** O [Archify](https://github.com/tt-a1i/archify) é uma skill de agente que transforma Mermaid em HTML interativo e autocontido. O kit não o instala nem o chama. Se você o tiver instalado, peça ao Claude **fora de um workflow ativo** (depois que o workflow terminar, ou antes de retomar um pausado), para que os arquivos dele não entrem na mudança do workflow. Por exemplo: "Use o Archify para transformar o diagrama de sequência de `.factory/workflows/<id>/plan.md` em um diagrama interativo." Antes disso:

- O Archify escreve em `.archify/` no seu repositório. Adicione essa pasta ao `.gitignore`.
- A checagem de entrega dele usa um navegador real, então precisa do Chrome ou do Chromium instalado.
- Toda entrega verifica atualizações do Archify pela rede. Defina `ARCHIFY_UPDATE_CHECK_DISABLED=1` para desligar isso.
- O Archify refaz o diagrama a partir do Mermaid em vez de convertê-lo mecanicamente. Compare o resultado com o plano antes de compartilhá-lo.

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
