# Contract: Task Classification

Schema: `classification.schema.json`. Config: `classification.*` in `config.schema.json`.

## Rubric

Before scoring, the classifier inspects the repository. It locates the affected files and components and checks for existing tests, so scores rest on evidence rather than on the wording of the request. Each dimension is scored 0, 1 or 2.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| `scope` | one function or file | a few related files | many files or a feature area |
| `complexity` | mechanical | some logic | non-trivial algorithms, concurrency or state |
| `architecturalImpact` | none | local pattern change | new component, boundary, data model or integration |
| `components` | one | 2–3 | more than 3, or crosses frontend/backend/infra |
| `dependencies` | none | internal | new external dependency or cross-team contract |
| `risk` | cosmetic | user-visible behaviour | data, money, security, auth or migrations |
| `uncertainty` | requirements clear | minor ambiguity resolvable from code | behaviour undefined; needs decisions |
| `testing` | existing tests suffice | new unit tests | new test strategy or integration/e2e |
| `codebaseFamiliarity` | well-known area | partly known | unfamiliar or undocumented |
| `regressionRisk` | isolated | shared code paths | widely used core paths |

## Mode selection (defaults)

1. `total = Σ scores` (0–20).
2. `suggestedMode`:
   - `full_spec` if `total ≥ thresholds.fullSpec` (12), or if any dimension in `escalateToFullSpecWhenMax` scored 2 (default: `architecturalImpact`).
   - `standard` if `total ≥ thresholds.standard` (5).
   - `quick` otherwise.
3. **Uncertainty is not an automatic escalator.** When `uncertainty = 2`, the classifier sets `discoveryJustified`. It is `true` only when the open questions are about *behaviour or domain* and the repository cannot answer them. If a code lookup can resolve the uncertainty, the classifier does the lookup and re-scores instead of escalating.
4. A `standard` task with `discoveryJustified = true` stays `standard` unless it also meets the FULL-SPEC conditions. Its open questions are asked during planning.
5. `confidence` is `low` when evidence is thin (for example, the affected code could not be located). `confirmWithUser` (default `when_low_confidence`) decides whether to ask the user before proceeding.

The user can always force a mode, for example with `/factory:start --mode quick …`. This is recorded as `override.by = "user"`, with `from` set to the suggested mode.

## Output

- `manifest.classification` holds the structured result.
- `classification.md` holds two or three sentences of rationale plus the evidence list, for humans.

## Testing note

Scoring thresholds and mode selection are deterministic and unit-tested (`lib/classify.mjs`, Phase 3). The *scores themselves* come from model judgment and can only be checked by behavioural evals (`claude plugin eval`, Phase 8), which are reported separately from unit tests.
