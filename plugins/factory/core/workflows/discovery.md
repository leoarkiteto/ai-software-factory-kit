# Discovery Procedure (FULL-SPEC, status `discovering`)

Discovery establishes **shared understanding**: domain, behaviour, vocabulary, constraints, decisions. It does not write the spec. Contract: `docs/contracts/discovery-provider.md` in the kit.

## 1. Choose the provider

Run `factory-state providers`. Use `discovery.provider` from config (default `grill-with-docs`) and the detection result:

| Situation | Action |
|---|---|
| `grill-with-docs` configured and available | §2 |
| `grill-with-docs` configured but **unavailable** (missing, or dependencies missing) | Record it first: `factory-state provider <id> discovery --requested grill-with-docs --status unavailable --note "<detection note>"`. Then apply `discovery.whenUnavailable` (below) |
| `native` configured | §3 |

Values of `whenUnavailable`:

- `ask` (default): tell the user what is missing and show the install commands from `providers`. Offer three options: install it and resume, use the native fallback, or stop. Run `block --kind user_input` and wait.
- `native`: say that you are using the native fallback, then go to §3.
- `stop`: `transition failed --reason "discovery provider unavailable"`.

## 2. `/grill-with-docs` (user-invoked)

This skill **cannot be invoked by you**: it sets `disable-model-invocation`. Only the user can start it.

1. Write `.factory/workflows/<id>/discovery-brief.md` from `factory-state guide templates/discovery-brief`. Use the repository facts you already gathered. Then `factory-state artifact <id> discoveryBrief .factory/workflows/<id>/discovery-brief.md`.
2. `factory-state provider <id> discovery --requested grill-with-docs --status pending`
3. `factory-state block <id> --kind discovery_session --detail "user to run <invocation> with the discovery brief"`
4. Tell the user exactly this, then **end your turn**:
   > Discovery is ready. Please run:
   > `<invocation from providers> @.factory/workflows/<id>/discovery-brief.md`
   > Answer its questions until it confirms we share an understanding. Then run `/factory:resume <id>`.
5. **Do not take part** in the grilling session: no extra questions, no writing the spec meanwhile.

When the user resumes:

6. Confirm the session actually happened. The user says so, **or** the conversation shows it. Then run `factory-state discovery-evidence <id>`.
7. **If there is no confirmation and no doc changes**, do not record grill-with-docs as used. Ask the user whether the session ran, or offer the native fallback.
8. If discovery happened: `factory-state provider <id> discovery --used grill-with-docs --status completed --evidence "<user confirmed shared understanding; changed: …>"`. Then write the summary (§4).

## 3. Native fallback

Use this only when §1 selects it. It is deliberately simpler than grill-with-docs.

1. `factory-state provider <id> discovery --requested <configured> --used native --status in_progress --note "<why native>"`
2. Write the brief as in §2.1.
3. Interview the user in **rounds**:
   - Each round asks all the questions you can ask now: their prerequisites are settled, and their answers do not depend on another question in the same round.
   - Number every question, give your recommended answer, and word it so that "yes" accepts the recommendation.
   - Facts come from the repository: look them up yourself, and never ask the user for them.
   - Run `block --kind user_input` between rounds.
   - Continue until no decision is left open, then ask the user to confirm shared understanding.
4. If the repository already uses `GLOSSARY.md` or `docs/adr/`, record resolved terms and hard-to-reverse decisions there, following the existing format. If it does not, ask before creating them.
5. `factory-state provider <id> discovery --status completed --evidence "native interview, <n> rounds; user confirmed; docs: …"`

## 4. Discovery summary and completion

1. Write `.factory/workflows/<id>/discovery-summary.md` from `factory-state guide templates/discovery-summary`. Link glossary entries and ADRs; do not copy them.
2. `factory-state artifact <id> discoverySummary .factory/workflows/<id>/discovery-summary.md`. If ADRs were written, also `factory-state artifact <id> adrs <path>`, and `glossary` for the glossary file.
3. Run `factory-state discovery-check <id>`. If blocking open questions remain, resolve them with the user. Discovery is not complete until there are none.
4. `factory-state transition <id> specifying --reason "discovery completed via <provider>"`. The CLI re-runs the check.
