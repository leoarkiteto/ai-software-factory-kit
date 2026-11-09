# Classification Rubric

Score each dimension 0, 1 or 2 **from repository evidence** (files located, tests found, components touched), not from how the request is worded. If you cannot locate the affected code, say so and use `confidence: "low"`.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| `scope` | one function or file | a few related files | many files or a feature area |
| `complexity` | mechanical | some logic | non-trivial algorithms, concurrency or state |
| `architecturalImpact` | none | local pattern change | new component, boundary, data model or integration |
| `components` | one | 2–3 | >3, or crosses frontend/backend/infra |
| `dependencies` | none | internal | new external dependency or cross-team contract |
| `risk` | cosmetic | user-visible behaviour | data, money, security, auth or migrations |
| `uncertainty` | requirements clear | minor ambiguity resolvable from code | behaviour undefined; needs decisions |
| `testing` | existing tests suffice | new unit tests | new test strategy or integration/e2e |
| `codebaseFamiliarity` | well-known area | partly known | unfamiliar or undocumented |
| `regressionRisk` | isolated | shared code paths | widely used core paths |

Rules:

- `factory-state classify` computes the total and the mode from the configured thresholds. **Do not pick the mode yourself.** Only supply scores.
- Uncertainty that a code lookup can resolve is not uncertainty. Look it up first, then score.
- Set `discoveryJustified: true` only when `uncertainty` is 2 **and** the open questions are about behaviour or domain decisions the repository cannot answer.
- `rationale`: 1–3 sentences. `evidence`: the concrete repository facts you used (paths, test files).
- Prefer the lighter mode when two are plausible. A task can escalate later through `replanning`, so over-classifying costs more than under-classifying.
