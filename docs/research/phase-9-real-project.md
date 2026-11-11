# Phase 9: Real Project Run

The kit (0.1.0) was installed from the local marketplace (`claude plugin install … --scope project`), and the repository integration was added with `factory-install plan`/`apply`, in an existing application: a Go 1.27 todo app with `net/http`, templ, HTMX, Tailwind and SQLite (`modernc.org/sqlite`), with no tests. The request was real: *username/password authentication and per-user authorization, credentials in SQLite*. One conversation was continued with `claude -p --resume` (Claude Code 2.1.322, permission mode `acceptEdits`, an allow list for `go`, `templ`, `gofmt`, `make` and read-only `git`). These are **real runs, not mocks**.

| Step | Prompt (as the user) | Result | Cost (USD) |
|---|---|---|---|
| 1 | `/factory:start <request>` | FULL-SPEC (score 14, high confidence): new data model, auth risk, schema migration, no tests. The discovery brief listed repository facts with `file:line` and 9 open decisions. No code changed | 0.41 |
| 2 | `/grill-with-docs @brief` + the user's 9 answers in the same message | The skill accepted the answers as decided and asked 9 further questions: CSRF before login, session fixation, absolute vs sliding expiry, `Secure` on localhost, bcrypt's 72-**byte** limit, and others | 0.53 |
| 3 | "sim a todas" | `GLOSSARY.md` written, no ADR (justified). One denied Read of the skill's own format file under `~/.claude/skills/` (known, phase 6) | 0.63 |
| 4 | `/factory:resume` | Local spec provider (no Spec Kit): 20 FR, 4 NFR, 19 AC, edge cases; `spec-check` passed | 1.03 |
| 5 | `/factory:resume … Spec aprovada` | `plan.md` with fixed contracts and a DAG of 4 tasks (T1 backend ∥ T2 frontend → T3 backend → T4 QA). Architecture plan review: NEEDS_CHANGES (F1 high: the static directory had to be configurable, or the `/static/` test could not pass), then APPROVED | 2.94 |
| 6 | `/factory:resume … Plano aprovado` | T2 completed. **T1 blocked by the guard**: see defect 1. The worker did not work around it; the orchestrator asked the user | 3.83 |
| 7 | `/factory:resume … 1` (write the files with Write/Edit) | T1, T3 and T4 completed; 30 tests (the repository's first). Code and architecture change reviews ran in parallel: both APPROVED_WITH_WARNINGS. Completed with open issue I1 (Tailwind classes missing from the compiled CSS). No commit | 7.99 |

Total: 17.36 USD.

**Independent check of the result.** `go vet`, `go test` and `templ generate && go build` passed outside the kit. A copy of the app was run and exercised with `curl`: redirects without a session (303 and `HX-Redirect`), registration with case normalisation, the duplicate-username and 72-byte errors, the generic login error, cookie flags, CSRF 403 (missing token, another user's token), cross-user toggle and delete answered 404 with the other user's task unchanged, a dead cookie after logout, and bcrypt hashes in the database. All matched the spec.

## Defects found and fixed (0.1.1)

1. **The guard read heredoc bodies as commands.** `segments()` split on newlines, so each line of `cat > migrate.go <<'EOF' … EOF` was checked as a shell command. The worker's migration code contained `DROP TABLE tasks`, and the `database` rule (the only rule not anchored at the start of a command) denied the whole write. The same split would have denied any file whose content had a line starting with `git push`, `rm -rf /`, `kubectl apply` and so on. The `database` rule also denied `grep -rn 'DROP TABLE' src`, commit messages and `truncate app.log`. Fix:
   - heredoc bodies are data, unless some part of the command runs a shell (`bash <<EOF`, `cat <<EOF | sh`, `ssh host <<EOF`, `source`, `eval`);
   - destructive SQL is checked over the whole command (bodies and pipes included), but denied only when a segment invokes a database client.

   A self-review of the fix found that `<<` inside `(( … ))` (an arithmetic shift) would have opened a heredoc and hidden the next line. Heredocs are therefore not recognised inside `(( … ))`, and a bare delimiter must start with a letter or `_`.

   Covered by regression tests, including the cases that must stay denied (`echo 'DROP …' | sqlite3`, `sqlite3 db <<EOF`, `docker compose exec db psql -c "TRUNCATE …"`).
2. **The operating rules pointed to a policy switch that does not exist.** They said "ask the user … to change the policy in `.factory/config.json`", so the orchestrator offered "allow it via `security.blockedCommands`", which only adds blocks. The rules and the troubleshooting guide now name the real switches (`allowGitPush`, `hooks.commandGuard: false`), and say that a denied shell file write is retried with Write/Edit.
3. **Subagents wasted turns on shell reads and writes.** Workers and reviewers used `cat`, heredocs, `W=…; cat $W/…` and `cd … &&` chains. The user's permissions denied them (Claude Code: "A variable set in this command can't be checked before it runs"), and the agents then fell back to Read/Write. The worker contract (new rule 6) and the reviewer contract now say: read with Read/Grep/Glob, write with Write/Edit, use Bash only to run programs, one command per call, and record a denial in `limitations` when it prevented a verification.

## Observations (no change)

- **Subagent denials are invisible in `claude -p` output.** `permission_denials` was empty for steps 5 to 7, but the subagent transcripts show 7 denied calls: 6 by the user's permissions and the guard denial of step 6. The testing guide now says how to audit them.
- **Generated assets outside the validation commands.** The frontend worker used Tailwind classes that the compiled CSS lacked. It could not check this (its grep was denied), and it reported it, and the final report raised it as issue I1. A project whose CSS is built should include that build in `validation.commands.build`.
- **The repository was not a git repository.** It was initialised with a baseline commit before installation, so that the reviewers' `git diff <baseRef>` had a base. Running the kit in a directory without git was not exercised.

## STANDARD run (kit 0.1.1)

Same project, after the authentication work was committed. Request: password recovery.

| Step | Prompt (as the user) | Result | Cost (USD) |
|---|---|---|---|
| 1 | `/factory:start Adicionar "Recuperar senha".` | FULL-SPEC (score 15): there is no e-mail or other channel, so the recovery channel is a product decision, and recovery was out of scope in the previous workflow. A correct classification. The workflow was abandoned (recorded as `failed`, because there was no `cancelled` status) | 0.48 |
| 2 | The same feature, restated with the decisions made: recovery code generated by the logged-in user, one nullable column in `users`, `/recover` with the existing anonymous CSRF, generic errors, all sessions deleted on success | **STANDARD** (score 10): uncertainty 0, architecturalImpact 1, so no escalation. No `--mode` override. Plan with 4 tasks (T1 ∥ T2 → T3 → T4) and 4 decisions flagged for the user | 0.81 |
| 3 | `/factory:resume … Plano aprovado.` | All 4 tasks completed on the first attempt. Code and architecture reviews APPROVED_WITH_WARNINGS. 50 tests (was 30). Completed; no commit | 4.40 |

**Independent check.** `go vet`, `go test` and the build passed. A copy of the app on another port was exercised in 17 scenarios:
- CSRF and authentication on code generation;
- the code is shown once, with `no-store`, and only a bcrypt hash is stored;
- regenerating replaces the old code;
- an old code, a wrong user or an unknown user gets the same 401;
- the code is matched case-insensitively and trimmed;
- on success the code is set to `NULL` and the user's sessions are deleted, including the old cookie; the code cannot be reused;
- the old password is rejected and the new one works;
- no reflected XSS through `?recovered`;
- another user's sessions are untouched.

**Effect of 0.1.1.** No guard false positives. Subagent permission denials went from 6 to 3:
- one `cat >> file <<EOF` by the QA worker, despite worker contract rule 6 (it switched to Edit after the denial);
- two `git -C <path> diff` calls by the reviewers, which do not match `Bash(git diff*)`.

The orchestrator also improvised `git status --porcelain | md5 && …` for the read-only check, and it was denied.

**Fixed in 0.1.2:**
- a `cancelled` status: terminal and final, reachable from any open status and from `failed`, user-approved only. The operating rules forbid using it to escape a failure;
- the reviewer and worker contracts, and the review brief, say to run `git` from the repository root, without `-C`;
- `review.md` says to run the read-only snapshot as a plain `git status --porcelain`, as its own call.
