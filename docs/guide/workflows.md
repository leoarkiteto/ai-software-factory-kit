# Workflow diagrams

These diagrams follow the runtime procedures in `plugins/factory/core/workflows/` (`quick.md`, `standard.md`, `full-spec.md`, `execution.md`, `review.md`). If a diagram and a procedure disagree, the procedure is right.

**Legend**
- Rounded boxes are workflow **statuses**, as stored in the manifest.
- ⏸ marks a **pause for you**. The workflow records `blockedOn`, tells you exactly what it needs, and you continue with `/factory:resume [id] <answer>`.
- Any stage can also pause when it needs a decision that is not shown here, for example a command that needs your approval or a guard denial.

## 1. Classification: which mode runs

```mermaid
flowchart TD
    A["/factory:start request"] --> B["Read-only repository inspection"]
    B --> C["Score the rubric:<br/>10 dimensions, 0–2 each"]
    C --> D{"Total ≥ 12, or<br/>architecturalImpact = 2?"}
    D -- yes --> FS["FULL-SPEC"]
    D -- no --> E{"Total ≥ 5?"}
    E -- yes --> ST["STANDARD"]
    E -- no --> Q["QUICK"]
    C -. "low confidence" .-> U[/"⏸ Confirm the mode"/]
```

- The thresholds and the escalation dimensions come from `classification` in the config. The defaults are shown above.
- `--mode quick|standard|full_spec` forces a mode, and the forced mode is recorded with its reason.
- Uncertainty counts only when the repository cannot resolve it. A request that states its decisions scores lower: in Phase 9, the same feature scored FULL-SPEC 15 when worded vaguely and STANDARD 10 once its decisions were stated.

## 2. QUICK

Small, isolated changes. There is no plan document and no delegation: the orchestrator implements the change itself.

```mermaid
flowchart TD
    S(["classifying"]) --> A["Focused analysis:<br/>target code, callers, tests"]
    A --> B{"Still QUICK?"}
    B -- no --> ESC["Re-classify, or escalate<br/>to STANDARD (tell the user)"]
    B -- yes --> T["Define the single task T1:<br/>scope and acceptance criteria"]
    T --> X(["executing"])
    X --> I["Orchestrator implements<br/>in the main thread"]
    I --> V["Run the validation commands<br/>and record each result"]
    V --> F{"Failing because<br/>of the change?"}
    F -- yes --> I
    F -- no --> R{"Risk flagged?<br/>(review.code.quick = on_risk)"}
    R -- yes --> RV(["reviewing:<br/>independent code-reviewer"])
    R -- no --> IN(["integrating"])
    RV --> IN
    IN --> FIN["Final validation,<br/>short final report"]
    FIN --> C(["completed"])
```

- Escalation after execution has started goes through `replanning → planning` with `--mode standard`.
- Because the orchestrator implements, a review, when one is required, must go to `factory:code-reviewer`. The orchestrator never reviews its own work.

## 3. STANDARD

Moderate features that touch several files or components. A light plan, workers for the tasks, and an independent review.

```mermaid
flowchart TD
    S(["classifying"]) --> P(["planning"])
    P --> Q1{"Questions the repository<br/>cannot answer?"}
    Q1 -- yes --> U1[/"⏸ One round of questions,<br/>each with a recommended answer"/]
    U1 --> PL
    Q1 -- no --> PL["plan.md with the inline spec<br/>(scope, FR, AC) and the task DAG"]
    PL --> U2[/"⏸ Approve the plan"/]
    U2 -- "changes requested" --> PL
    U2 -- approved --> E(["executing"])
    E --> W["Workers run the ready tasks<br/>(in parallel when scopes do not overlap)"]
    W --> RV(["reviewing"])
    RV --> CR["code-reviewer (always)<br/>+ architecture-reviewer (on risk)"]
    CR --> D{"Decision"}
    D -- "NEEDS_CHANGES,<br/>rounds left" --> E
    D -- "round limit reached,<br/>or BLOCKED" --> U3[/"⏸ Escalation: accept the risk,<br/>replan, or stop"/]
    D -- "APPROVED<br/>(with or without warnings)" --> FU["Record non-required findings<br/>as open issues"]
    FU --> IN(["integrating"])
    IN --> AC["Final validation, check every AC,<br/>final report with a follow-up request"]
    AC --> C(["completed"])
```

- Execution and review are detailed in §5.
- The round limit is `review.maxIterations`, 3 by default.
- An acceptance criterion that is not met blocks completion unless you accept it.

## 4. FULL-SPEC

Architectural, cross-domain or uncertain work. Discovery comes before specification, specification before planning, and planning before any code. **Product code is not changed before you approve the plan.**

```mermaid
flowchart TD
    S(["classifying"]) --> RD["Repository discovery:<br/>facts with file references"]
    RD --> DI(["discovering"])
    DI --> BR["discovery-brief.md:<br/>known facts and open questions"]
    BR --> PV{"/grill-with-docs<br/>available?"}
    PV -- yes --> G[/"⏸ Type /grill-with-docs @brief and<br/>answer until there is shared understanding"/]
    PV -- no --> NF["Native fallback questions<br/>(or install it and resume)"]
    G --> DS["discovery-summary.md,<br/>GLOSSARY.md, ADRs"]
    NF --> DS
    DS --> SP(["specifying"])
    SP --> SV{"Spec Kit 1.x<br/>initialised?"}
    SV -- yes --> SK["speckit-specify<br/>+ Factory supplements"]
    SV -- no --> LS["Local spec template"]
    SK --> SC["spec-check:<br/>FR, NFR, AC, scope"]
    LS --> SC
    SC --> U1[/"⏸ Approve the spec"/]
    U1 --> PL(["planning"])
    PL --> PP["plan.md with contracts first,<br/>task DAG covering every FR"]
    PP --> PR["Plan review:<br/>architecture-reviewer"]
    PR -- "required findings" --> PP
    PR -- approved --> U2[/"⏸ Approve the plan"/]
    U2 --> EX(["executing ⇄ reviewing<br/>as in STANDARD, with code and<br/>architecture review always"])
    EX --> IN(["integrating"])
    IN --> V["Walk every FR, NFR, AC and SC<br/>with evidence, final report"]
    V --> C(["completed"])
```

- Discovery may write domain docs (`GLOSSARY.md`, ADRs) and nothing else.
- Only you can start `/grill-with-docs`, which is why discovery always pauses.

## 5. Execution and review loop (STANDARD and FULL-SPEC)

```mermaid
flowchart TD
    N["factory-state next"] --> A{"Next action"}
    A -- run_tasks --> B["Brief each ready task<br/>and dispatch it to its worker"]
    B --> R["Collect the JSON report,<br/>cross-check it against git status"]
    R --> N
    A -- retry_tasks --> RT["Task back to pending,<br/>the brief carries the failure"]
    RT --> B
    A -- replan --> RP(["replanning"])
    RP --> RPL["Revise the plan or the tasks"]
    RPL --> N
    A -- review --> RV(["reviewing"])
    RV --> SNAP["git status snapshot"]
    SNAP --> RVS["Reviewers in parallel,<br/>independent of the implementers"]
    RVS --> CHK{"Tree unchanged?"}
    CHK -- no --> DISC["Discard that review<br/>and record an issue"]
    CHK -- yes --> SUB["factory-state review<br/>prints the decision"]
    SUB -- rework --> RW["Tasks with required findings<br/>back to pending"]
    RW --> N
    SUB -- integrate --> IN(["integrating"])
    SUB -- escalate --> ESC[/"⏸ Escalation"/]
```

- A failed task is retried up to `execution.maxTaskAttempts` times, 2 by default. After that its dependants are blocked and `next` asks for a replan.
- A worker that hits a "Factory guard" denial stops and reports `blocked`. It never works around the denial.

## 6. Status model

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
    reviewing --> executing: rework
    reviewing --> replanning
    reviewing --> integrating
    replanning --> planning
    replanning --> executing
    integrating --> executing
    integrating --> replanning
    integrating --> completed
    failed --> replanning: resume (user-approved)
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

- Every open status can also move to `failed` or `cancelled`. Those edges are left out of the diagram for readability.
- `failed` means the work could not be done. It can be resumed into `replanning` with your approval.
- `cancelled` means you abandoned the workflow. It needs `--user-approved` and is final.
- `completed` is final. Follow-ups start a new workflow: see [usage](usage.md#after-completion-follow-ups).
- Full transition table: [workflow-state contract](../contracts/workflow-state.md).
