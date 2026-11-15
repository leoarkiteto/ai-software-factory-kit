# Plan: <title>

Workflow: `<id>` · Mode: <STANDARD|FULL-SPEC> · Spec: <link, or "inline below" for STANDARD>

## Summary
<2–5 sentences: what will change and why. Link the original request.>

## Scope
- **In:** …
- **Out:** …

## Requirements (STANDARD: inline spec. FULL-SPEC: reference the spec instead.)
- **FR-1:** …
- **AC-1** (FR-1): Given … when … then …

## Approach
<The chosen design. Mention rejected alternatives only when the choice is not obvious.>

## Components affected
- `path/or/module`: what changes

## Research (optional)
<Delete when no research was done. Otherwise one line per note: `research/R<n>.md`, the topic, the versions covered, and its status.>

## Technical decisions
| Decision | Rationale | ADR-worthy? |
|---|---|---|

## Interfaces and contracts
<APIs, types or schemas that other tasks depend on. These are defined first.>

## Diagrams (optional)
<Include this section when the change spans several components, or changes an interface between them, a state machine or a data model. Otherwise delete it. One to three fenced `mermaid` blocks, each showing only what changes, using only `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram` or `classDiagram`. Name nodes as in "Components affected" and "Interfaces and contracts". No styling (`style`, `classDef`, themes). Keep the next line as written.>
Illustrative only: the text of this plan is the plan of record. If a diagram disagrees with it, the text wins and the diagram is fixed.

## Tasks
| ID | Title | Role | Depends on | Scope |
|---|---|---|---|---|

## Validation strategy
<Which configured commands run when; new tests required; how each AC is verified.>

## Risks
| Risk | Mitigation |
|---|---|
