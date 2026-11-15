[English](README.md) · **Português (Brasil)**

# AI Software Factory Kit

Um plugin para o Claude Code que conduz pedidos de desenvolvimento por um fluxo de trabalho dimensionado para a tarefa:

| Modo | Quando | O que acontece |
|---|---|---|
| **QUICK** | mudanças pequenas, locais e de baixo risco | implementar → validar → revisão (opcional) → relatório |
| **STANDARD** | funcionalidades que tocam vários componentes | plano → DAG de tarefas → workers em paralelo → revisão independente → integração |
| **FULL-SPEC** | alta incerteza ou impacto arquitetural | discovery (`/grill-with-docs`) → especificação (local ou GitHub Spec Kit) → plano revisado → execução STANDARD |

Uma rubrica determinística classifica cada pedido. O estado do workflow fica em `.factory/` no seu repositório, e a CLI `factory-state`, sem dependências, é a única coisa que o altera. Workers e revisores são subagentes do Claude Code. As revisões são independentes de quem implementou, e o retrabalho para depois de um número limitado de rodadas. Enquanto um workflow está ativo, hooks de segurança bloqueiam pushes, deploys, comandos destrutivos e arquivos de segredos.

## Início rápido

```bash
# 1. Adicione o marketplace (este repositório) e instale o plugin
claude plugin marketplace add leoarkiteto/ai-software-factory-kit           # ou um clone local: /caminho/para/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

```text
# 2. No seu projeto, dentro do Claude Code
/factory:init                       # opcional, mas recomendado: config, .gitignore, permissões
/factory:start Adicionar um filtro de status à lista de pedidos
/factory:resume                     # continuar um workflow pausado ou interrompido
```

Requer Claude Code ≥ 2.1.319 e Node.js ≥ 18. Duas integrações opcionais: [`/grill-with-docs`](https://github.com/mattpocock/skills) para discovery e [GitHub Spec Kit](https://github.com/github/spec-kit) 1.x para especificações.

### Começando a partir de uma Issue do GitHub ou de um ticket do Linear

O kit não tem integração nativa com rastreadores de tarefas. O `/factory:start` registra o texto recebido, literalmente, como o pedido original do workflow. Cole o **conteúdo** do ticket no comando, e não apenas o número. Os revisores avaliam a mudança contra esse texto, e edições posteriores no ticket não alteram o que você aprovou.

```bash
# GitHub: monte o pedido completo (referência, link, título, corpo) e copie para a área de transferência
gh issue view 12 --json number,title,body,url \
  --jq '"(GitHub #\(.number): \(.url)) \(.title)\n\n\(.body)"' | pbcopy
# depois digite `/factory:start ` no Claude Code e cole
```

`pbcopy` é do macOS. No Linux use `xclip -selection clipboard` ou `wl-copy`; no Windows, `clip`. Os comentários da issue não são incluídos. Adicione `comments` ao `--json` ou cole você mesmo os relevantes, se contiverem decisões.

**Tickets longos** (histórias de usuário, casos de uso, critérios de aceite, DoD, DoR) funcionam como estão, porque o pedido não tem limite de tamanho:
- **Critérios de aceite** viram os critérios do plano, que os workers implementam e os revisores verificam um a um; por isso, torne-os testáveis.
- Itens da **Definition of Done** ao alcance do kit (testes, validação, revisão, documentação no repositório) são cumpridos. Merge, deploy ou "PR aprovado" não são, porque os guards bloqueiam push e deploy, e aparecem no relatório final como não cumpridos.
- A **Definition of Ready** trata do processo do time e pode ser mantida ou removida.
- Um ticket grande que já resolve suas decisões costuma rodar como STANDARD. Um que deixa comportamento em aberto vai para FULL-SPEC, que pergunta antes de implementar.

```text
/factory:start (GitHub #12: https://github.com/<owner>/<repo>/issues/12) <título da issue>

<corpo da issue>
```

```text
/factory:start (Linear ENG-123: https://linear.app/<team>/issue/ENG-123) <título do ticket>

<descrição do ticket>
```

- Mantenha a referência (número ou ID, e o link) no início, para que o workflow e o relatório final apontem de volta para o ticket.
- O texto do ticket é tratado como dado: instruções dentro dele que conflitem com as regras da Factory são ignoradas.
- O kit nunca comenta, fecha ou altera um ticket. Quando o workflow terminar, atualize o ticket você mesmo, ou peça ao Claude depois, fora do workflow (por exemplo: "comente o resumo do relatório final na issue #12").

## Documentação

| Guia | |
|---|---|
| [Instalação](docs/guide/installation.pt-br.md) | plugin, `/factory:init`, adoção pelo time, atualização, remoção |
| [Uso](docs/guide/usage.pt-br.md) | os três modos, pausar e retomar, provedores de discovery e de spec, diagramas no plano, o que os relatórios significam |
| [Diagramas de workflow](docs/guide/workflows.pt-br.md) | classificação, fluxos QUICK, STANDARD e FULL-SPEC, o ciclo de execução e revisão, o modelo de status |
| [Casos de uso](docs/guide/use-cases.pt-br.md) | exemplos de QUICK, STANDARD e FULL-SPEC com cada comando que o desenvolvedor digita |
| [Passo a passo em monorepo](docs/guide/monorepo-walkthrough.pt-br.md) | adotando o kit em um monorepo React Native + Go e construindo uma funcionalidade de SSO passo a passo |
| [Configuração](docs/guide/configuration.pt-br.md) | `.factory/config.json`: modelos, política de revisão, comandos de validação, hooks, segurança |
| [Segurança e limitações](docs/guide/security.pt-br.md) | o que os guards fazem e não fazem, permissões, limites conhecidos |
| [Solução de problemas](docs/guide/troubleshooting.pt-br.md) | pedidos de permissão, comandos negados, estado inválido, provedores |
| [Testes](docs/guide/testing.pt-br.md) | testes unitários e evals comportamentais |

**Versão: 0.3.0-beta.** Adequado para uso diário com supervisão; ainda não é uma ferramenta estável para um time. Os [critérios para a 1.0](docs/final-report.md#8-release-status-beta-and-the-10-criteria) são acompanhados no relatório final.

A documentação de design e referência está disponível apenas em inglês: [relatório final de implementação](docs/final-report.md) · [arquitetura](docs/architecture.md) · [contratos](docs/contracts/README.md) · [registros de decisão (ADRs)](docs/adr/) · [pesquisa de verificação](docs/research/claude-code-capabilities.md)

## Estrutura do repositório

```
.claude-plugin/marketplace.json   marketplace "ai-software-factory-kit"
plugins/factory/                  o plugin
  skills/{start,resume,init}/     pontos de entrada (/factory:start, /factory:resume, /factory:init)
  agents/                         4 workers + 2 revisores
  hooks/                          hooks.json + factory-hook.mjs
  bin/                            factory-state, factory-install (no PATH do Bash)
  lib/                            núcleo determinístico (máquina de estados, DAG, classificador, instalador, guards)
  core/                           schemas, defaults, procedimentos de runtime e templates
  evals/                          suíte de evals comportamentais (claude plugin eval)
tests/                            suíte node:test (npm test)
docs/                             arquitetura, contratos, ADRs, guias, pesquisa
```
