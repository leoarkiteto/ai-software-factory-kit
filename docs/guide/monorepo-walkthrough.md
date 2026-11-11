# Walkthrough: a React Native + Go monorepo, and an SSO feature

This walkthrough adopts the kit in a monorepo that is already in development, then delivers an SSO authentication and authorization feature with it. For the commands you type in each mode, see [use cases](use-cases.md).

> The kit has not yet been exercised on a monorepo like this one. The steps follow what the code and the procedures do. `/factory:init` is covered by unit tests but has not run in a real session yet; step A3 gives the manual fallback.

Assumed layout:

```
my-project/
├── api/       # Go (go.mod here)
└── mobile/    # React Native (package.json here)
```

---

## Part A: installation and configuration

### A1. Install the plugin (once per machine)

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

Requires Claude Code ≥ 2.1.319 and Node ≥ 18.

### A2. One validation command per kind, at the root

The kit detects validation commands **at the repository root only** (`package.json`, `Makefile`, `go.mod`, …). It stores **one command per kind** (`test`, `lint`, `typecheck`, `build`). In a monorepo, the simplest setup is a root `Makefile` that calls both projects:

```make
.PHONY: test lint typecheck build
test:
	cd api && go test ./...
	cd mobile && npm test -- --watchAll=false
lint:
	cd api && go vet ./...
	cd mobile && npm run lint
typecheck:
	cd mobile && npx tsc --noEmit
build:
	cd api && go build ./...
```

`init` then detects `make test`, `make lint`, `make typecheck` and `make build`. If the root also has a `package.json` with scripts (workspaces), those take precedence over the Makefile. Check what is detected when `init` asks.

### A3. Set up the repository

Open Claude Code at the monorepo root:

```text
/factory:init
```

| Question | Suggested answer |
|---|---|
| Components | `config`, `gitignore-block`, `settings-permissions`; optionally `rules` |
| Where the permission rules go | `.claude/settings.local.json` (only you) or `.claude/settings.json` (the team) |
| Deny rules | Optional. They apply to **every** session, not only to workflows |
| Validation commands | Confirm `make test`, `make lint`, `make typecheck`, `make build` |

Check that the plan shows `Bash(factory-state *)` and `Edit(/.factory/**)`, then approve it.

**Manual fallback:** add the two rules to `permissions.allow` in `.claude/settings.local.json`, and create `.factory/config.json` as in A4.

### A4. Adjust the config for mobile and auth

Edit `.factory/config.json`. A hook validates it on save.

```json
{
  "schemaVersion": 1,
  "validation": {
    "commands": { "test": "make test", "lint": "make lint", "typecheck": "make typecheck", "build": "make build" }
  },
  "security": {
    "protectedPaths": [
      ".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*",
      "**/*.keystore", "**/*.jks", "**/*.p12", "**/*.mobileprovision"
    ]
  }
}
```

`protectedPaths` **replaces** the default list, which is why the defaults are repeated here. The list adds Android and iOS signing material. During a workflow, workers can neither read nor write these files.

### A5. Explain the monorepo to the agents

Workers follow `CLAUDE.md`. Put the essentials at the root:

```markdown
# Monorepo
- api/: Go 1.22, chi router, Postgres (sqlc). Tests: go test ./...
- mobile/: React Native 0.76 + TypeScript, React Navigation, Jest.
- Conventions: handlers in api/internal/http/, domain logic in api/internal/<domain>/; screens in mobile/src/screens/.
```

With this, the plan can give each task its own set of files (`api/**` for backend, `mobile/**` for mobile). The scheduler runs tasks **in parallel** only when their files do not overlap.

### A6. Optional integrations (recommended for SSO)

```bash
claude plugin install mattpocock-skills@claude-plugins-official   # discovery with /grill-with-docs
```

Spec Kit is optional. Without it, the kit uses its own spec template, which is enough here.

### A7. Commit the configuration

```bash
git add .factory/config.json .gitignore Makefile CLAUDE.md   # plus .claude/settings.json if shared
git commit -m "Configure AI Software Factory"
```

---

## Part B: SSO authentication and authorization

### B1. Write the request

Describe the goal and what you already know. Open decisions are resolved in discovery.

```text
/factory:start Add SSO authentication and authorization. The mobile app (React Native) must let users sign in through the company IdP (OIDC, probably Azure AD / Entra ID). The Go API must validate tokens and enforce role-based authorization (admin, manager, user) on the existing endpoints. There is no authentication today.
```

The command must be at the **start** of the message.

### B2. Classification

The orchestrator inspects `api/` and `mobile/` and scores the rubric. For SSO, expect:

| Dimension | Score | Why |
|---|---|---|
| `architecturalImpact` | 2 | a new cross-cutting layer |
| `risk` | 2 | security |
| `uncertainty` | 2 | IdP, flows and role model undecided |
| `components` | 2 | mobile and API |

`architecturalImpact = 2` alone escalates to **FULL-SPEC**. You are told the mode and the reason. If confidence is low, you are asked to confirm.

### B3. Discovery (the workflow waits for you)

The orchestrator writes a brief and tells you exactly what to type, for example:

```text
/grill-with-docs @.factory/workflows/wf-20261111-sso-auth/discovery-brief.md
```

Only you can start `/grill-with-docs`. It interviews you one question at a time until no decision is left open. Typical questions for SSO:

- **IdP and protocol:** OIDC or SAML? Which tenant? One IdP or several?
- **Mobile flow:** Authorization Code + PKCE in the system browser, with no client secret in the app?
- **Tokens:** where are they stored on the device (Keychain / Keystore)? Refresh tokens? Session length?
- **API:** validate JWTs locally with JWKS, or use introspection? Which claims (`sub`, `roles`, `groups`)?
- **Authorization:** do roles come from IdP groups or from the API's database? Which endpoints need which role?
- **Users:** created on first login (just-in-time provisioning)? What happens to existing data?
- **Logout:** local only, or at the IdP too?

The outcome is a `GLOSSARY.md` and ADRs in `docs/adr/` (for example "Use OIDC Authorization Code + PKCE on mobile"). Then:

```text
/factory:resume
```

The Factory checks the evidence:
- changes to the glossary or ADRs;
- a `discovery-summary.md` with no blocking questions.

Without `/grill-with-docs`, the orchestrator offers to run the interview itself (the native fallback).

### B4. Specification (you approve it)

The orchestrator writes `spec.md` with numbered requirements. An excerpt:

```
FR-1  The mobile app authenticates the user via OIDC Authorization Code + PKCE.
FR-2  The API rejects requests without a valid token (401).
FR-3  The API enforces role-based authorization on the listed endpoints (403).
FR-4  A user is created on first login with role "user".
NFR-1 Tokens are stored only in the OS secure storage.
NFR-2 No IdP secret in the code or the app bundle.
AC-1  (FR-1) Signing in with a valid account leads to the home screen; cancelling returns to the login screen.
AC-2  (FR-2) GET /orders without Authorization → 401.
```

`factory-state spec-check` makes sure every FR is covered by an acceptance criterion. The workflow then pauses and shows you the scope, the FR and the AC:

```text
/factory:resume yes, approved
/factory:resume change FR-4: new users stay pending until an admin approves them
```

### B5. Plan and tasks (you approve them)

The orchestrator writes `plan.md`, with the contracts defined **first** so that parallel tasks share them:

| Task | Worker | Files | Depends on |
|---|---|---|---|
| T1 Contract: claims, roles, 401/403 errors, protected endpoints | backend | `api/internal/auth/contract.go`, `docs/auth.md` | — |
| T2 JWT/JWKS middleware + role authorization | backend | `api/internal/auth/**`, `api/internal/http/middleware/**` | T1 |
| T3 User provisioning on first login | backend | `api/internal/users/**`, `api/migrations/**` | T1 |
| T4 PKCE login, secure storage, HTTP interceptor | frontend | `mobile/src/auth/**`, `mobile/src/api/**` | T1 |
| T5 Integration and acceptance tests for the AC | qa | `api/**/*_test.go`, `mobile/__tests__/**` | T2, T3, T4 |
| T6 Environment variables, `.env.example`, IdP setup docs | devops | `.env.example`, `docs/setup-sso.md` | T1 |

Before asking you, the `architecture-reviewer` (Opus) reviews the plan. Then:

```text
/factory:resume approved
```

### B6. Execution (no input needed)

- T1 runs first.
- Then **T2, T3, T4 and T6 run in parallel**, up to 3 at a time by default, because their files do not overlap.
- T5 (QA) runs last.

Each worker (Sonnet) gets only its files, the AC and the validation commands. Its report is validated by `factory-state`.

What protects you while the workflow runs:
- Workers **cannot read `.env`** or the keystores. IdP settings live in documented environment variables (`.env.example`).
- `git push`, deployments, `kubectl`, `terraform` and destructive commands are denied.
- The devops worker prepares configuration but never deploys.

A failed task is retried (at most 2 attempts in all) or replanned. If the workflow needs you, it stops and says why.

### B7. Validation and reviews

1. `make lint`, `make typecheck` and `make test` run.
2. Two independent reviews follow, both required in FULL-SPEC: `code-reviewer` and `architecture-reviewer`.
3. Requested changes lead to rework and a new review, at most 3 rounds.
4. Without approval after 3 rounds, the workflow **escalates to you**: accept the risk, give guidance, or stop.

### B8. Integration and final report

`make build` runs. Then the orchestrator walks **every** FR, NFR and AC in the spec, marking each one met, partial or not met, with evidence. The result is `.factory/workflows/wf-20261111-sso-auth/final-report.md`, which covers:
- the files changed;
- validation results: a command that did not run shows as "skipped", never as "passed";
- the reviews;
- open issues;
- anything the orchestrator did itself.

**The Factory does not commit or push.** You review the diff, then:

```bash
git checkout -b feature/sso-auth
git add -A && git commit -m "Add SSO authentication and role-based authorization"
git push -u origin feature/sso-auth
```

---

## Tips

- **Interruptions.** `/factory:resume` continues from `.factory/`, even in a new session. `factory-state show` displays the state.
- **Cost.** A FULL-SPEC feature this size costs tens of dollars; the smaller test scenario cost about $17. Cheaper models for workers: `roles.<name>.model` in the config. Keep reviewers on Opus.
- **Smaller slices.** Splitting the feature (for example "API middleware only") can make it STANDARD: cheaper and faster.
- **IdP secrets.** Never put them in the request or the chat. A public client ID can live in code; anything sensitive goes in `.env`, which workers cannot read.
