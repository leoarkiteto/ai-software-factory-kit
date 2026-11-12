# Phase 10: FULL-SPEC with and without the providers

**Question:** what do `/grill-with-docs` and GitHub Spec Kit add to a FULL-SPEC workflow, and what do they cost, compared with the kit's native discovery and local spec templates?

**Answer, from one run per arm:** both arms delivered a working, correct feature. Without the providers the workflow used **47% less quota** and finished in one session. With them it produced richer specifications and repository docs, in the project's own Spec Kit layout, and surfaced more edge cases. The visual result was better in the provider arm, but one run cannot attribute that to the providers.

## Setup

- **Project:** an existing modular-monolith web app in Go (templ, HTMX, Tailwind, Alpine CSP build), with PostgreSQL and Redis. It has vertical-slice features, boundary-check scripts, a project constitution (test-first, no inline SVG, no cross-slice imports), and **Spec Kit 1.0.1 already in use**, with 11 earlier specs.
- **Request:** a real open GitHub issue, "Dashboard screen". It asks for donut charts of income and expenses, filters by date and category, and a customisable layout (add, remove, move). The request was built with the README's `gh issue view … --jq` command, identically for both arms.
- **Arms:** two git worktrees from the same commit, each with a setup commit that hid an earlier discovery note and regenerated stale generated files.

  | Arm | Discovery | Specification |
  |---|---|---|
  | **A** | `/grill-with-docs` | Spec Kit (`auto`, detected) |
  | **B** | native (`discovery.provider: native`) | local templates (`specification.provider: local`) |

- **Same answers:** an earlier discovery the user had approved (9 decisions, 7 defaults, a glossary) served as a fixed **decision sheet**. Each arm asked its own questions first, then received the whole sheet with one rule: "for anything not covered, take your own recommendation". Spec and plan were approved when consistent with the sheet. Architecture questions were left to each arm's plan.
- **Runtime:** kit 0.2.0-beta, `claude -p --plugin-dir`, permission mode `acceptEdits`, the same allow list in both arms. Integration tests ran against **real** PostgreSQL (per-arm database prefix) and a throwaway Redis container.
- **Validation:** `go vet ./...`; `make check` (tests plus three boundary scripts); `templ generate && make tailwind && go build ./...`.

## Results

| | **A**: grill + Spec Kit | **B**: native + local |
|---|---|---|
| **Quota used** (API-equivalent USD, session total) | **24.33** | **12.94** (−47%) |
| … discovery + spec + reviewed plan | 6.85 | 4.41 |
| … execution, review, integration | 17.48 | 8.53 |
| Wall time (sum of invocations) | ~50 min, plus two waits for the quota to reset | ~38 min, one session |
| Usage-limit interruptions | 2, both recovered (interrupted tasks re-run) | 0 |
| Classification | FULL-SPEC 17 (high) | FULL-SPEC 15 (medium) |
| Discovery questions | 9 in the brief, then 11 further decisions after the sheet | 10, asked inline with recommendations |
| Specification | 33 FR, 7 NFR, 6 AC, 7 SC, in `specs/012-…` (repo convention) | 18 FR, 5 NFR, 15 AC (Given/When/Then), in the workflow |
| Repository docs | `GLOSSARY.md`, ADR-0001 | none; ADR candidates listed in the final report |
| Plan review | 2 rounds. Required: a wrong CSRF field name (every layout change would have returned 403), missing i18n keys | 2 rounds. Required: a missing task dependency. Also found the pre-existing failing test |
| Tasks | 5, plus 1 added for the pre-existing failure | 6, plus 1 added for the pre-existing failure |
| Diff | 41 files, +4,902 / −75 | 35 files, +4,439 / −307 |
| Validation at the end (real DB) | all green | all green |
| Open issues at completion | 10 (2 medium) | 5 (1 medium) |

### Independent check

Both arms were built, seeded with the project's own development seed, and driven in headless Chromium over CDP:
- **Totals:** every chart total matched the database to the cent, in projected and in realized mode (income R$ 328.43, expenses R$ 6,600.00; realized R$ 300.00 and R$ 3,800.00; status pending, overdue and settled).
- **Filters:** they work through htmx and are reflected in the URL.
- **Layout:** remove, move and add each persisted across a reload.
- **Access:** a non-syndic user does not see the section and gets **403** on both routes. A layout change without a CSRF token gets **403**.

Differences:
- **Percentages:** in A they always sum to 100%, from decision R7 surfaced by `/grill-with-docs`. In B they can sum to 99%, because its spec did not require otherwise.
- **UI quality:** A's layout was cleaner. Its legend is aligned in a table, its card heights are equal, and its category filter uses grouped checkboxes. B's filter form had empty space and a cramped multi-select that cut off labels, its card heights varied, and some colours were reused with different meanings. B hides "move up" on the first card and "move down" on the last; A shows both on every card.

## What each provider contributed

- **`/grill-with-docs`** turned the decision sheet into 11 further explicit decisions: multi-select semantics, invalid date ranges, empty layouts, concurrent tabs, percentage rounding, audit, 403 for direct calls, role loss. It also caught a real code conflict: the money formatter and category labels live in the finance slice, which the new slice must not import. Its value was limited here because the main decisions came pre-made.
- **Spec Kit** produced a spec in the project's existing `specs/NNN-…` layout, with a requirements checklist and success criteria. For a project that already uses Spec Kit this is a maintenance gain. Its spec had fewer acceptance criteria than B's (6 against 15), but more functional requirements.
- **The native path** asked well-formed questions with recommendations, wrote more testable acceptance criteria, and found the time-bomb test in its plan review, before any code. Arm A found it only at final validation, which cost an extra round.

**Guidance:** use the providers when a feature has real behavioural uncertainty or the spec must live in the repository's Spec Kit layout. Use the native path when quota matters or when the decisions are already settled. This is from **one run per arm**: treat it as a data point, not a benchmark.

## Kit defects found (fixed in this PR)

1. **Completion was impossible with a pre-existing failure.**
   - **What happened:** the CLI refused `completed` while any validation failed, with no user override. The procedures forbid fixing unrelated tests, so on a repository with a test that already failed, the workflow could only finish by extending its scope. Both arms hit this.
   - **Fix:** the user may accept the failure. It must be recorded as an issue with status `accepted_risk`, and the transition must use `--user-approved`. QUICK step 6 now describes both options, and FULL-SPEC refers to it.
2. **There was no way to close an issue.**
   - **What happened:** a fixed issue stayed `open` in the manifest while the final report said it was resolved.
   - **Fix:** a new `factory-state issue-status <id> <I> --status … --resolution '…'` command. A resolution is required for every status except `open`. The procedures say to mark the issues a workflow fixed as `resolved`.
3. **`$` inside double-quoted text was denied.**
   - **What happened:** an issue description containing `$2::date` was refused by Claude Code's permission checker.
   - **Fix:** the operating rules now say to quote free text with single quotes.
4. **Validation commands were wrapped in pipes.**
   - **What happened:** the orchestrator ran `make check | tail; echo ${PIPESTATUS[0]}` twice, and both calls were denied. 0.1.3's "one command per call" rule was not followed.
   - **Fix:** the operating rules now say explicitly to run validation commands exactly as configured, with nothing around them.
5. **The cost figures in the docs were wrong.** `total_cost_usd` is cumulative for a resumed session, but earlier Phase 9 figures added the cumulative values together.
   - **Corrected Phase 9 costs:** FULL-SPEC $7.99 (was $17.36), STANDARD $4.88 (was $5.69), QUICK $1.12 (was $1.95).
   - **Phase 6:** its total carries a correction note.
   - **Testing guide:** it now explains how to read cost from the CLI output.

## Confirmed from earlier fixes

- **0.1.2:** no reviewer used `git -C`, and no subagent had a permission denial in either arm.
- **0.1.4:** non-required review findings were recorded as issues, and each final report ended with a ready-to-paste follow-up request.
- **Recovery:** two usage-limit interruptions in arm A were recovered from the manifest, without losing work. This was the first real-session recovery since Phase 6.

## Not covered

- Repeat runs. Each arm ran once.
- Whether the UI difference comes from the providers.
- A run where discovery had to settle the main decisions itself, without a decision sheet.
- One `Read` of `~/.claude/skills/domain-modeling/GLOSSARY-FORMAT.md` was denied in arm A even with a `Read(//…)` allow rule passed to `--allowedTools` (the known Phase 6 limitation). The skill continued without it.
