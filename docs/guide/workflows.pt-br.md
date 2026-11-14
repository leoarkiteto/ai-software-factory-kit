[English](workflows.md) · **Português (Brasil)**

# Diagramas de workflow

Estes diagramas seguem os procedimentos de runtime em `plugins/factory/core/workflows/` (`quick.md`, `standard.md`, `full-spec.md`, `execution.md`, `review.md`). Se um diagrama e um procedimento discordarem, o procedimento está certo.

**Legenda**
- Caixas arredondadas são **status** do workflow, como armazenados no manifest.
- ⏸ marca uma **pausa para você**. O workflow registra `blockedOn`, diz exatamente o que precisa, e você continua com `/factory:resume [id] <resposta>`.
- Qualquer etapa também pode pausar quando precisa de uma decisão que não aparece aqui, por exemplo um comando que precisa da sua aprovação ou uma negação do guard.

## 1. Classificação: qual modo roda

```mermaid
flowchart TD
    A["/factory:start pedido"] --> B["Inspeção do repositório<br/>somente leitura"]
    B --> C["Pontuar a rubrica:<br/>10 dimensões, 0–2 cada"]
    C --> D{"Total ≥ 12, ou<br/>architecturalImpact = 2?"}
    D -- sim --> FS["FULL-SPEC"]
    D -- não --> E{"Total ≥ 5?"}
    E -- sim --> ST["STANDARD"]
    E -- não --> Q["QUICK"]
    C -. "confiança baixa" .-> U[/"⏸ Confirmar o modo"/]
```

- Os limiares e as dimensões de escalonamento vêm de `classification` na config. Os defaults são os mostrados acima.
- `--mode quick|standard|full_spec` força um modo, e o modo forçado é registrado com o motivo.
- A incerteza só conta quando o repositório não consegue resolvê-la. Um pedido que explicita suas decisões pontua menos: na fase 9, a mesma funcionalidade pontuou FULL-SPEC 15 quando descrita de forma vaga e STANDARD 10 depois que suas decisões foram explicitadas.

## 2. QUICK

Mudanças pequenas e isoladas. Não há documento de plano nem delegação: o próprio orquestrador implementa a mudança.

```mermaid
flowchart TD
    S(["classifying"]) --> A["Análise focada:<br/>código alvo, chamadores, testes"]
    A --> B{"Ainda é QUICK?"}
    B -- não --> ESC["Reclassificar, ou escalar<br/>para STANDARD (avisar o usuário)"]
    B -- sim --> T["Definir a tarefa única T1:<br/>escopo e critérios de aceite"]
    T --> X(["executing"])
    X --> I["O orquestrador implementa<br/>na thread principal"]
    I --> V["Rodar os comandos de validação<br/>e registrar cada resultado"]
    V --> F{"Falhando por causa<br/>da mudança?"}
    F -- sim --> I
    F -- não --> R{"Risco sinalizado?<br/>(review.code.quick = on_risk)"}
    R -- sim --> RV(["reviewing:<br/>code-reviewer independente"])
    R -- não --> IN(["integrating"])
    RV --> IN
    IN --> FIN["Validação final,<br/>relatório final curto"]
    FIN --> C(["completed"])
```

- Um escalonamento depois que a execução começou passa por `replanning → planning` com `--mode standard`.
- Como o orquestrador implementa, uma revisão, quando obrigatória, precisa ir para o `factory:code-reviewer`. O orquestrador nunca revisa o próprio trabalho.

## 3. STANDARD

Funcionalidades moderadas que tocam vários arquivos ou componentes. Um plano leve, workers para as tarefas e uma revisão independente.

```mermaid
flowchart TD
    S(["classifying"]) --> P(["planning"])
    P --> Q1{"Perguntas que o repositório<br/>não responde?"}
    Q1 -- sim --> U1[/"⏸ Uma rodada de perguntas,<br/>cada uma com resposta recomendada"/]
    U1 --> PL
    Q1 -- não --> PL["plan.md com a spec inline<br/>(escopo, FR, AC) e o DAG de tarefas"]
    PL --> U2[/"⏸ Aprovar o plano"/]
    U2 -- "mudanças pedidas" --> PL
    U2 -- aprovado --> E(["executing"])
    E --> W["Workers executam as tarefas prontas<br/>(em paralelo quando os escopos não se sobrepõem)"]
    W --> RV(["reviewing"])
    RV --> CR["code-reviewer (sempre)<br/>+ architecture-reviewer (em caso de risco)"]
    CR --> D{"Decisão"}
    D -- "NEEDS_CHANGES,<br/>restam rodadas" --> E
    D -- "limite de rodadas atingido,<br/>ou BLOCKED" --> U3[/"⏸ Escalonamento: aceitar o risco,<br/>replanejar ou parar"/]
    D -- "APPROVED<br/>(com ou sem avisos)" --> FU["Registrar achados não obrigatórios<br/>como issues em aberto"]
    FU --> IN(["integrating"])
    IN --> AC["Validação final, conferir cada AC,<br/>relatório final com pedido de follow-up"]
    AC --> C(["completed"])
```

- A execução e a revisão são detalhadas no §5.
- O limite de rodadas é `review.maxIterations`, 3 por padrão.
- Um critério de aceite não atendido bloqueia a conclusão, a menos que você o aceite.

## 4. FULL-SPEC

Trabalho arquitetural, entre domínios ou incerto. O discovery vem antes da especificação, a especificação antes do planejamento, e o planejamento antes de qualquer código. **O código do produto não é alterado antes de você aprovar o plano.**

```mermaid
flowchart TD
    S(["classifying"]) --> RD["Discovery do repositório:<br/>fatos com referências a arquivos"]
    RD --> DI(["discovering"])
    DI --> BR["discovery-brief.md:<br/>fatos conhecidos e perguntas em aberto"]
    BR --> PV{"/grill-with-docs<br/>disponível?"}
    PV -- sim --> G[/"⏸ Digite /grill-with-docs @brief e<br/>responda até haver entendimento comum"/]
    PV -- não --> NF["Perguntas do fallback nativo<br/>(ou instale e retome)"]
    G --> DS["discovery-summary.md,<br/>GLOSSARY.md, ADRs"]
    NF --> DS
    DS --> SP(["specifying"])
    SP --> SV{"Spec Kit 1.x<br/>inicializado?"}
    SV -- sim --> SK["speckit-specify<br/>+ complementos da Factory"]
    SV -- não --> LS["Template local de spec"]
    SK --> SC["spec-check:<br/>FR, NFR, AC, escopo"]
    LS --> SC
    SC --> U1[/"⏸ Aprovar a spec"/]
    U1 --> PL(["planning"])
    PL --> PP["plan.md com contratos primeiro,<br/>DAG de tarefas cobrindo cada FR"]
    PP --> PR["Revisão do plano:<br/>architecture-reviewer"]
    PR -- "achados obrigatórios" --> PP
    PR -- aprovado --> U2[/"⏸ Aprovar o plano"/]
    U2 --> EX(["executing ⇄ reviewing<br/>como no STANDARD, com revisão de<br/>código e de arquitetura sempre"])
    EX --> IN(["integrating"])
    IN --> V["Percorrer cada FR, NFR, AC e SC<br/>com evidências, relatório final"]
    V --> C(["completed"])
```

- O discovery pode escrever documentos de domínio (`GLOSSARY.md`, ADRs) e nada mais.
- Só você pode iniciar o `/grill-with-docs`, e por isso o discovery sempre pausa.

## 5. Ciclo de execução e revisão (STANDARD e FULL-SPEC)

```mermaid
flowchart TD
    N["factory-state next"] --> A{"Próxima ação"}
    A -- run_tasks --> B["Preparar o brief de cada tarefa pronta<br/>e despachá-la para seu worker"]
    B --> R["Coletar o relatório JSON,<br/>conferir contra o git status"]
    R --> N
    A -- retry_tasks --> RT["Tarefa volta para pending,<br/>o brief carrega a falha"]
    RT --> B
    A -- replan --> RP(["replanning"])
    RP --> RPL["Revisar o plano ou as tarefas"]
    RPL --> N
    A -- review --> RV(["reviewing"])
    RV --> SNAP["Snapshot do git status"]
    SNAP --> RVS["Revisores em paralelo,<br/>independentes de quem implementou"]
    RVS --> CHK{"Árvore inalterada?"}
    CHK -- não --> DISC["Descartar essa revisão<br/>e registrar uma issue"]
    CHK -- sim --> SUB["factory-state review<br/>imprime a decisão"]
    SUB -- rework --> RW["Tarefas com achados obrigatórios<br/>voltam para pending"]
    RW --> N
    SUB -- integrate --> IN(["integrating"])
    SUB -- escalate --> ESC[/"⏸ Escalonamento"/]
```

- Uma tarefa que falhou é tentada de novo até `execution.maxTaskAttempts` vezes, 2 por padrão. Depois disso suas dependentes ficam bloqueadas e o `next` pede um replanejamento.
- Um worker que recebe uma negação do "Factory guard" para e reporta `blocked`. Ele nunca contorna a negação.

## 6. Modelo de status

```mermaid
stateDiagram-v2
    [*] --> classifying
    classifying --> executing: QUICK
    classifying --> planning: STANDARD
    classifying --> discovering: FULL-SPEC
    discovering --> specifying
    specifying --> discovering
    specifying --> planning
    planning --> specifying
    planning --> executing
    executing --> reviewing
    executing --> integrating
    executing --> replanning
    reviewing --> executing: retrabalho
    reviewing --> replanning
    reviewing --> integrating
    replanning --> planning
    replanning --> executing
    integrating --> executing
    integrating --> replanning
    integrating --> completed
    failed --> replanning: retomar (aprovado pelo usuário)
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

- Todo status aberto também pode ir para `failed` ou `cancelled`. Essas transições foram omitidas do diagrama para facilitar a leitura.
- `failed` significa que o trabalho não pôde ser feito. Ele pode ser retomado para `replanning` com a sua aprovação.
- `cancelled` significa que você abandonou o workflow. Exige `--user-approved` e é final.
- `completed` é final. Follow-ups iniciam um novo workflow: veja [uso](usage.pt-br.md#após-a-conclusão-follow-ups).
- Tabela completa de transições: [contrato de workflow-state](../contracts/workflow-state.md) (em inglês).
