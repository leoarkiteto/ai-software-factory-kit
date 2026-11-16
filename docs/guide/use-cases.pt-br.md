[English](use-cases.md) · **Português (Brasil)**

# Casos de uso: o que o desenvolvedor digita em cada modo

Os exemplos abaixo usam o mesmo monorepo React Native + Go do [passo a passo](monorepo-walkthrough.pt-br.md), já configurado com `/factory:init`. Cada um mostra:
- por que o kit escolhe o modo;
- as etapas;
- **cada comando que você digita, e quando**.

O modo é calculado pelo `factory-state classify` a partir das notas da rubrica ([rubrica](../../plugins/factory/core/rubric.md), em inglês). Os limiares são:
- QUICK quando o total é menor que 5;
- STANDARD a partir de 5;
- FULL-SPEC a partir de 12, ou sempre que `architecturalImpact` for 2.

As notas abaixo são as que o orquestrador deveria encontrar. As reais dependem do seu código.

## Resumo

| | QUICK | STANDARD | FULL-SPEC |
|---|---|---|---|
| Exemplo | Data do pedido exibida em UTC | Paginação de pedidos (API + mobile) | Autenticação e autorização SSO |
| Comandos que você digita | `/factory:start` e, no final, seu próprio git commit | `/factory:start`, respostas a uma rodada de perguntas, aprovação do plano, git commit | `/factory:start`, `/grill-with-docs`, vários `/factory:resume` (discovery, spec, plano), git commit |
| Pausas para você | nenhuma (a menos que seja preciso confirmar) | perguntas (se houver), aprovação do plano | discovery, aprovação da spec, aprovação do plano |
| Plano / spec | nenhum | `plan.md` com FR e AC | `discovery-summary.md`, `spec.md`, `plan.md` |
| Quem implementa | o próprio orquestrador | workers (em paralelo quando os arquivos não se sobrepõem) | workers (em paralelo quando os arquivos não se sobrepõem) |
| Revisões (padrão) | revisão de código apenas se uma dimensão de risco for 2 | revisão de código sempre; revisão de arquitetura em caso de risco | revisão de código + arquitetura sempre, mais uma revisão do plano |

Você pode interromper ou retomar qualquer modo a qualquer momento com `/factory:resume`.

---

## 1. QUICK: data do pedido exibida em UTC

**Situação.** Na tela de detalhes do pedido, a data aparece em UTC em vez do horário local do dispositivo. O bug está em um helper de formatação em `mobile/`.

```text
/factory:start A data do pedido na tela OrderDetails é exibida em UTC; deveria usar o fuso horário local do dispositivo. A formatação fica em mobile/src/utils/date.ts.
```

**Classificação esperada** (total 2 → QUICK):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 |

**O que acontece.** `classifying → executing → integrating → completed`

1. O orquestrador lê `date.ts`, seus chamadores e seus testes, e registra uma única tarefa T1 com seus arquivos.
2. Ele corrige o helper **por conta própria**, sem delegar, e adiciona ou ajusta o teste.
3. Ele roda `make test` e `make lint` e registra os resultados.
4. Não há revisão: nenhuma dimensão de risco teve nota 2 (`review.code.quick: on_risk`).
5. Ele escreve um `final-report.md` curto e mostra um resumo de 3 a 6 linhas.

**O que você digita:**

| # | Quando | Você digita |
|---|---|---|
| 1 | Início | `/factory:start <pedido>` |
| 2 | Só se o kit pedir para confirmar o modo (confiança baixa) | `/factory:resume sim` |
| 3 | Depois do resumo | `git diff`, e então `git commit` você mesmo |

Essa é toda a interação. Se a correção se mostrar maior que o esperado (por exemplo, a API também envia datas no formato errado), o orquestrador avisa e escala para STANDARD, mantendo o workflow.

---

## 2. STANDARD: paginação da lista de pedidos

**Situação.** `GET /orders` retorna todos os pedidos, e a lista no mobile fica lenta. Você quer paginação baseada em cursor na API e scroll infinito no app.

```text
/factory:start Adicionar paginação baseada em cursor ao GET /orders na API Go (limit + cursor, padrão 20) e scroll infinito na tela OrdersList do mobile. Manter os campos atuais da resposta.
```

**Classificação esperada** (total 8 → STANDARD):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 2 | 0 | 1 | 1 | 1 | 0 | 0 |

`components = 2` (atravessa mobile e API), mas `architecturalImpact` é só 1, então o pedido não escala para FULL-SPEC.

**O que acontece.** `classifying → planning → executing ⇄ reviewing → integrating → completed`

1. **Perguntas, em uma rodada.** O orquestrador pergunta apenas o que o código não responde, cada pergunta com uma resposta recomendada. Por exemplo:
   - "1. Um cursor baseado em `created_at,id` é aceitável? (recomendado: sim)"
   - "2. O comportamento antigo, sem paginação, deve continuar para outros clientes? (recomendado: não)"

   Se nada estiver em aberto, ele não pergunta nada.
2. **Plano.** `plan.md` com escopo (dentro e fora), FR, AC e validação, mais uma tabela de tarefas:

   | Tarefa | Worker | Arquivos | Depende de |
   |---|---|---|---|
   | T1 Contrato de paginação (query params, `nextCursor`) | backend | `api/internal/orders/contract.go` | — |
   | T2 Query paginada + handler | backend | `api/internal/orders/**`, `api/internal/http/orders*.go` | T1 |
   | T3 Scroll infinito + cliente da API | frontend | `mobile/src/screens/OrdersList/**`, `mobile/src/api/orders.ts` | T1 |
   | T4 Testes para os AC | qa | `api/internal/orders/*_test.go`, `mobile/__tests__/orders*` | T2, T3 |
3. **Execução.** T1, depois T2 e T3 **em paralelo**, depois T4. Cada worker retorna um relatório validado.
4. **Validação e revisão.**
   - `make lint`, `make typecheck` e `make test` rodam.
   - O `code-reviewer` revisa de forma independente. A revisão de arquitetura é pulada, porque nenhuma dimensão de risco é 2.
   - Mudanças pedidas levam a retrabalho e a uma nova revisão, no máximo 3 rodadas.
5. **Integração.** `make build` roda e cada AC é conferido. Critérios não atendidos viram issues que você precisa aceitar explicitamente. Em seguida vem o relatório final.

**O que você digita:**

| # | Quando | Você digita |
|---|---|---|
| 1 | Início | `/factory:start <pedido>` |
| 2 | O workflow pausa com perguntas numeradas | `/factory:resume 1 sim, 2 não` (ou `/factory:resume use as recomendações`) |
| 3 | O workflow pausa com o plano e as tarefas | `/factory:resume aprovado`, ou `/factory:resume mudar: …` |
| 4 | Só se o ciclo de revisão escalar (3 rodadas sem aprovação) | `/factory:resume aceito o risco: …`, ou orientações, ou `parar` |
| 5 | Depois do relatório final | revise o `git diff` e faça commit / PR você mesmo |

---

## 3. FULL-SPEC: autenticação e autorização SSO

**Situação.** O app não tem login. Você quer SSO com o IdP da empresa no mobile e autorização baseada em papéis na API. O passo a passo completo está no [passo a passo em monorepo](monorepo-walkthrough.pt-br.md#parte-b-autenticação-e-autorização-sso).

```text
/factory:start Adicionar autenticação e autorização SSO. O app mobile deve permitir que os usuários entrem pelo IdP da empresa (OIDC, provavelmente Entra ID). A API Go deve validar tokens e aplicar autorização baseada em papéis (admin, manager, user) nos endpoints existentes.
```

**Classificação esperada** (total 17, e `architecturalImpact = 2` sozinho já escalaria → FULL-SPEC):

| scope | complexity | archImpact | components | dependencies | risk | uncertainty | testing | familiarity | regression |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 0 | 1 |

**O que acontece.** `classifying → discovering → specifying → planning → executing ⇄ reviewing → integrating → completed`

1. **Discovery.** Você e o `/grill-with-docs` definem o IdP, os fluxos, os tokens, os papéis e o provisionamento. O resultado é o `GLOSSARY.md`, os ADRs e o `discovery-summary.md`.
2. **Spec.** `spec.md` com FR, NFR e AC, verificado pelo `spec-check`. Você o aprova.
3. **Plano.** Os contratos vêm primeiro, depois o DAG de tarefas (backend, frontend, qa, devops). O `architecture-reviewer` revisa o plano, e então você o aprova.
4. **Execução.** Os workers rodam em paralelo quando seus arquivos não se sobrepõem. O `.env` e os keystores ficam protegidos, e push e deploy ficam bloqueados.
5. **Revisões.** Revisão de código e revisão de arquitetura são ambas obrigatórias, com no máximo 3 rodadas de retrabalho.
6. **Integração.** Cada FR, NFR e AC é marcado como atendido, parcial ou não atendido, com evidências, no relatório final.

**O que você digita:**

| # | Quando | Você digita |
|---|---|---|
| 1 | Início | `/factory:start <pedido>` |
| 2 | Só se o kit pedir para confirmar o modo | `/factory:resume sim` |
| 3 | O workflow pausa para o discovery | `/grill-with-docs @.factory/workflows/<id>/discovery-brief.md` (a linha exata é mostrada para você). Depois responda às perguntas até ele terminar |
| 4 | O discovery terminou | `/factory:resume` |
| 5 | O workflow pausa com o resumo da spec (escopo, FR, AC) | `/factory:resume sim, aprovado`, ou `/factory:resume mudar FR-4: …` |
| 6 | O workflow pausa com o plano revisado e as tarefas | `/factory:resume aprovado`, ou `/factory:resume mudar: …` |
| 7 | Só em escalonamento (rodadas de revisão esgotadas, uma tarefa falhou duas vezes, um AC não atendido) | `/factory:resume <decisão ou orientações>` |
| 8 | Depois do relatório final | revise o `git diff` e faça commit / PR você mesmo |

Se o `/grill-with-docs` não estiver instalado, o passo 3 muda. O kit oferece três opções:
- instalá-lo e retomar;
- `/factory:resume use o fallback nativo`: o próprio orquestrador entrevista você, em rodadas, e cada resposta é um `/factory:resume <respostas>`;
- parar.

---

## 4. STANDARD com design no Figma: chips de filtro por status

**Situação.** O designer desenhou no Figma chips de filtro por status para a lista de pedidos do app, com estado selecionado e estado vazio. Você tem o plugin da Figma instalado (`claude plugin install figma@claude-plugins-official`) e um seat Dev.

```text
/factory:start Adicionar chips de filtro por status na tela OrdersList do app, como em https://www.figma.com/design/AbC123/Orders?node-id=12-34 (padrão e selecionado) e node-id=12-56 (estado vazio). O filtro acontece no cliente; sem mudança na API.
```

**O que acontece.** Classificação como no caso 2, e então:

1. **Referência de design.** No planejamento, o orquestrador envia ao `factory:design-worker` um brief de design `D1` com os nodes `12:34` e `12:56`, o tema (`mobile/src/theme/**`) e os componentes de UI (`mobile/src/components/ui/**`). A nota volta com o layout, uma tabela de tokens, os componentes a reutilizar (o `Chip` existente tem a variante `selected`), os textos e as lacunas:
   - "Os estados de loading e de erro não estão no design."
   - "`radius/pill` (999) não tem token no tema."

   O orquestrador baixa os screenshots dos frames com `factory-state fetch-design-image` para `.factory/workflows/<id>/design/`.
2. **Perguntas sobre as lacunas, numa rodada.** Por exemplo:
   - "1. O design não tem estado de loading. Reutilizar o skeleton atual da lista? (recomendado: sim)"
   - "2. Não há raio pill no tema. Adicionar `radii.pill` ao tema numa task própria? (recomendado: sim)"
3. **Plano.** As tasks citam `design/D1.md` nas constraints ("chip selecionado usa `theme.colors.primary` e a variante `selected` do `Chip`; sem hex literal") e os critérios de aceite podem ser verificados no código: estados implementados, tokens usados, textos literais.
4. **Execução e revisão.** O frontend worker implementa a partir da nota e dos screenshots; o code reviewer confere a mudança contra a mesma nota.
5. **Relatório final.** Ele lista "Conferência visual pendente: compare o app rodando com `design/D1.md` (estados: padrão, selecionado, vazio, loading)". Rode o app no simulador e compare.

**O que você digita:** como no caso 2, mais as respostas às perguntas sobre as lacunas. Se as ferramentas do Figma não estiverem disponíveis, o workflow pausa e pede que você exporte os frames como PNG para o repositório (por exemplo `docs/design/orders-chips-default.png`) e responda com os caminhos.

---

## Comandos que funcionam em qualquer modo

| Necessidade | Comando |
|---|---|
| Continuar depois de uma pausa, uma sessão fechada ou um limite de uso | `/factory:resume` (ou `/factory:resume <id>` quando há vários workflows ativos) |
| Forçar um modo | `/factory:start --mode quick\|standard\|full_spec <pedido>` (o motivo é registrado) |
| Ver o estado e o próximo passo | `factory-state show [id]`, dentro do Claude Code, ou `<plugin>/bin/factory-state` em um terminal |
| Listar workflows | `factory-state list` |
| Conferir a config | `factory-state config` |

Sempre digite o slash command no **início** da mensagem. Caso contrário, nenhuma skill é executada.
