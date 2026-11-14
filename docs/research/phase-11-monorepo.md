# Phase 11: Real Monorepo Run

Two FULL-SPEC workflows on a real monorepo, with real requests from its owner. Kit 0.2.1-beta, installed from the local marketplace (project and user scope, both reading this repository). Claude Code 2.1.325, `claude -p --resume`, permission mode `acceptEdits`. Allow list: `go`, `gofmt`, `npm exec`, `npx tsc`, `factory-state`, read-only `git` (`status`, `diff`, `log`, `show`). `npx expo` and `npm audit` were added in W2 when a task needed them (see below). These are **real runs, not mocks**.

**The project.** An npm-workspaces monorepo:
- `frontend/`: Expo SDK 57, React Native 0.86, TypeScript strict, no tests;
- `backend/`: Go 1.26, stdlib HTTP, SQLite, JWT, vertical slices, 34 test files.

The root `package.json` declares `"workspaces": ["frontend"]`, but the project in fact installs inside `frontend/`: the lockfile in git is `frontend/package-lock.json` and the root has no `node_modules`. This mismatch matters in W2.

**Setup before the runs.**
- `/factory:init` had been run interactively by the owner (receipt in `.factory/install.json`: config, gitignore block, settings permissions, rules). Root detection found no manifest, so the validation commands came from the dialogue: `go -C backend vet ./...` and `go -C backend test ./...`. **There was no frontend command**, so frontend work would not have been validated.
- Added `"typecheck": "npm exec --workspace=frontend -- tsc --noEmit"`.
- Before W1's spec stage, the owner asked for the local spec templates: `specification.provider: "local"`. (`.specify/` existed, but initialised for Copilot, so `auto` would also have chosen local: `detectSpecKit` requires the Claude `speckit-*` skills.)

## W1: password recovery

Request: *"O projeto já tem páginas de signin/signup, porém não tem recuperação de senha. Quero adicionar a recuperação de senha."*

| Step | Prompt (as the user) | Result | Cost (USD, cumulative) |
|---|---|---|---|
| 1 | `/factory:start <request>` | FULL-SPEC (15): auth, a new table, both sub-projects, **no e-mail channel at all**. Brief with 7 open decisions | 0.64 |
| 2 | `/grill-with-docs @brief` + 7 answers | Accepted them, checked the code, found 2 unrelated bugs (wrong HTTP method in `changePassword`, missing `/refresh`), asked Q1–Q7: backend password rule, flow shape, cooldown behaviour, error message, code storage (HMAC), log mailer in production, glossary | 0.92 |
| 3 | "Sim a todas", with a change to Q5: an HMAC subkey derived from `JWT_SECRET` instead of the secret itself | `GLOSSARY.md` (5 terms), Q8–Q9 (e-mail normalisation, navigation). One denied Read of the skill's format file (known, Phase 6) | 1.06 |
| 4–5 | Confirm, then `/factory:resume` | Spec: 17 FR, 5 NFR, 14 AC; `spec-check` passed. **Defect 1** below | 1.56 |
| 6 | `/factory:resume … Spec aprovada` | Plan, 6 tasks; T5 (frontend) parallel to T1–T4 (backend). Architecture review: NEEDS_CHANGES (a **real race**: concurrent wrong guesses could exceed 5 attempts; a flaky test), then APPROVED. Accepted risk: a new code every 60 s resets the attempts (~0.7 %/day per account) | 4.11 |
| 7 | `/factory:resume … Plano aprovado` | 6 tasks completed (T5 in 2 attempts: the code review found a navigation bug). Both reviews approved in round 2. Follow-up issues recorded, with the follow-up request. No commit | 11.86 |

Total: **11.86 USD**.

**Independent check.**
- `go vet`, `go test -race ./...` and `tsc --noEmit` passed outside the kit. The `service` package imports neither `net/http` nor `database/sql`.
- The real server on a fresh database, exercised with `curl` in 26 scenarios, all passed:
  - identical response for known and unknown e-mails;
  - 60 s cooldown with no new code;
  - only a hash stored;
  - a short password does not consume an attempt;
  - one generic error for every failure;
  - a new code invalidates the old one;
  - 15 min expiry;
  - blocked at the 5th wrong attempt;
  - **20 concurrent wrong guesses capped at exactly 5 attempts**;
  - other users unaffected;
  - the startup warning.
- Not verified: the screens in the simulator.

**Audit.** No subagent permission denials and no guard denials. Validation commands were run exactly as configured, with no pipes, and no `git -C` was used. Both are confirmed in transcripts. Two reviewer `grep`s looked for `node_modules` at the root, where there is none.

## W2: social sign-in (Google, GitHub)

Request: *"… Gostaria também de poder fazer o login com contas como Google, GitHub e Apple, ou seja, SSO."* During discovery the owner dropped Apple, accepting the App Store 4.8 risk.

| Step | Prompt (as the user) | Result | Cost (USD, cumulative) |
|---|---|---|---|
| 1 | `/factory:start <request>` | FULL-SPEC (18). Brief with 9 open decisions | 0.62 |
| 2 | `/grill-with-docs` + scope change + 9 answers | Found that e-mails are stored and matched case-sensitively, so auto-linking would create duplicate accounts. Asked Q1–Q12: passwordless marker vs table rebuild, "Login social" rather than "SSO", case-insensitive linking, identity after linking, messages, behaviour without credentials (503), libraries and dev build, API contract, ADRs | 0.96 |
| 3–4 | "Sim a todas"; Q13 (a) | 2 ADRs and 4 glossary terms. One denied Read of the ADR format file (known) | 1.20 |
| 5 | `/factory:resume` | Spec: 17 FR, 6 NFR, 22 AC. `requested: "local"` recorded correctly (fresh session) | 1.78 |
| 6 | **Spec change requested by the user**: pre-account hijacking (an attacker registers the victim's e-mail with a password; auto-linking would give the attacker's password access to the victim's account) | FR-18 added (remove the password and invalidate pending reset codes, atomically, on auto-linking), plus AC-23 and AC-24 (rollback). ADR 0001, the glossary and the discovery summary were updated. `spec-check` passed again. Accepted risk: JWTs issued before linking stay valid for up to 24 h | 2.14 |
| 7 | `/factory:resume … Spec aprovada` | Plan, 7 tasks; T2, T3 and T6 in parallel after T1. Architecture review in 2 rounds found **2 more real problems**, which became spec changes: lowercase the e-mail on linking (otherwise a victim registered as `Vitima@Gmail.com` could never recover), and fix the `POST`/`PATCH` mismatch that AC-17 depends on. 3 denials (see audit) | 6.23 |
| 8 | `/factory:resume … Plano aprovado` | T1–T4 completed. **T6 blocked**: `npx expo install` was denied. The worker wrote all sources, did **not** edit `package.json` by hand, and reported `blocked`. **The session hit the usage limit** during T5 | 10.46 |
| 9 | `/factory:resume`, with `npx expo` and `npm audit` allowed | T5 completed after the interruption. **Defect 2** below: the orchestrator ran the install itself, the root became a workspace, and the dependencies split between the root and `frontend/`. The orchestrator stopped and asked for a lockfile decision | 13.99 |
| 10 | The owner kept the `frontend/`-only model. I removed the root lockfile and `node_modules` and ran `npm install --workspaces=false` in `frontend/` (outside the workflow), then reported the results to the orchestrator | T6 (attempt 3) and T7 completed. Both reviews approved in round 2; the code review found that cancelling the GitHub sheet showed an error. 4 low-severity issues recorded, including I4: a rare race between a password reset and auto-linking can give the linked account a password back | 23.04 |

Total: **23.04 USD** (one session).

**Independent check.**
- `go vet`, `go test ./...` and `tsc` passed outside the kit, with nothing at the root.
- `npm audit` was identical to the parent commit (13 pre-existing advisories, none new).
- `expo install --check` reported only 3 pre-existing patch-level mismatches.
- A temporary end-to-end Go test (real SQLite, real handlers, real Google verifier against a fake JWKS with my own RSA key, real HTTP; deleted afterwards) passed:
  - **AC-23 over HTTP:**
    - the attacker's password gets 401;
    - the attacker's pending code gets 400;
    - the victim recovers and sets a password;
    - a second Google login keeps that password.
  - **AC-25:** the same, with the attacker registered as `Vitima@Gmail.com`.
  - **Tokens rejected:** unverified e-mail, wrong `aud`, wrong `iss`, expired, garbage, and **HS256 algorithm confusion**.
  - **Passwordless accounts:** 401 for any password; Change password answers with the guidance message.
  - **GitHub unconfigured:** 503.
  - **20 concurrent first logins** of one identity: 1 user, 1 identity, 1 profile.
- Not verified: real provider sign-in (no credentials) and the screens in the simulator.

**Audit.** 13 subagents.
- **Permission denials:** 9, all recovered without a workaround.
  - 3 from the architecture reviewer, including `git -C … | head; git -C …`;
  - 3 from the backend worker (`cd …; … | tail` chains and one `sed -i` edit);
  - 1 from the QA worker (a pipe into `sed`);
  - 1 from the frontend worker (`cd frontend && npx expo install … | tail`);
  - 1 Read.
- **Guard denials:** 1, correct. The code reviewer tried to read `backend/.env`, which is in `security.protectedPaths`. This was the first guard deny in a real session; the session was not under `bypassPermissions`.

## Defects found and fixed (0.2.2-beta)

1. **`provider` recorded a stale `requested`.** The config changed between W1's step 1 and its spec stage. The orchestrator did not run `factory-state providers` again and recorded `--requested auto` from the earlier output, while the config said `local`. The effect was nil here, because `local` was used either way, but the record was wrong. Fix: `factory-state provider` now takes `requested` from the current config. A different `--requested` is ignored and reported. Regression test in `tests/cli.test.mjs`, which fails without the fix.
2. **The orchestrator did a blocked task's work itself, with `cd`.** When the user allowed `npx expo`, the orchestrator ran `cd frontend`, then `npx expo install …` and `npx expo install --check`, instead of setting T6 back to `pending` and dispatching it to its worker. npm detected the root `workspaces` field and created a root lockfile and `node_modules`, emptying `frontend/node_modules` (≈560 → 69 packages). The kit gave no way to reach a sub-project without `cd`, and no hint that package managers adopt a parent workspace on their own. Fixes:
   - `execution.md`: a resolved blocked task goes back to `pending` and to its worker; the orchestrator does not run its commands;
   - operating rules and the worker contract: never `cd`, not even alone. Reach sub-projects with the tool's own option (`npm run --workspace`, `npm exec --workspace`, `go -C`, `make -C`). Check how the project installs dependencies before installing, and ask if unclear;
   - the monorepo walkthrough: commands without a root Makefile, and a `CLAUDE.md` line that states how dependencies are installed, with the `workspaces` trap.

## Observations (no change)

- **Tool-use rules are still broken by subagents.** About ten calls across the two workflows used `cd … &&`, `;` chains, pipes, `sed -i` or `git -C`, all against rules that already exist and are explicit. W1 was clean, and the same contracts failed in W2. The 0.1.2–0.1.4 instruction fixes are therefore **not** confirmed as a class. Each denial was recovered, and none led to a workaround.
- **Root-only detection in `init`** found nothing in this layout (already documented). One kind holds one command, so `test` covers only the backend.
- **The plugin installed in two scopes** (project and user, same source) showed no doubled hook effects in the transcripts.
- **Usage-limit interruption** (W2, step 8): the manifest kept T5 `running`, and `/factory:resume` finished it. Same as Phase 10.
- **Reviews found real defects in every round they asked for changes:**
  - plan reviews: the attempt-limit race (W1); the lowercase recovery path and the method mismatch (W2);
  - code reviews: navigation (W1); GitHub cancel (W2).
- **The owner's spec change** (pre-account hijacking) was the most important security decision of W2, and it came from outside the kit's own review. The architecture review then extended it (AC-25).

## Effect on the 1.0 criteria

- **The monorepo and TypeScript/React runs** happened, but both workflows found a new kit defect, so the **five-run count stays at 0**.
- **First real-session coverage:**
  - a guard deny (not under `bypassPermissions`);
  - a worker that stopped at a permission denial without working around it;
  - a spec change after the spec was written;
  - resuming after a usage-limit interruption.
- `/factory:init` ran interactively, by the owner; its transcript was not audited.
