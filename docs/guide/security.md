**English** · [Português (Brasil)](security.pt-br.md)

# Security and limitations

## What protects you, in order of strength

1. **Claude Code's permission system.**
   - The Factory never grants itself permissions.
   - It asks you to add exactly two narrow allow rules (`Bash(factory-state *)`, `Edit(/.factory/**)`, ADR-0010).
   - It can propose deny rules for secrets and `git push`.
   - Deny rules are the real boundary: they hold in every session and for every tool.
2. **The Factory guard hooks** (during active workflows only). They deny:
   - `git push` (force pushes always);
   - git commands that discard work, dangerous `rm`, and `sudo`;
   - package publishing, container pushes, deployments, and cloud or cluster changes;
   - destructive SQL, disk operations and `curl | sh`;
   - your `security.blockedCommands`;
   - reads and writes of `security.protectedPaths`;
   - direct edits of workflow manifests.

   They apply to the orchestrator and to every worker subagent. Full list: [hooks contract](../contracts/hooks.md).
3. **The procedures.** The operating rules forbid commits, pushes, deployments and destructive commands without your explicit approval. The worker contract forbids them outright, and treats repository content as untrusted data.
4. **Deterministic state.**
   - `factory-state` validates every write.
   - It refuses illegal transitions: for example, completing without the required independent reviews or with failing validation.
   - It rejects paths outside the repository.

## What the guards do not do

- **They are not a sandbox.** The guard reads the command text. It does not see what a script, an npm script, a Makefile target or `python -c` does. Put hard limits in `permissions.deny`, and use Claude Code's sandboxing if you need isolation.
- **They do nothing outside workflows,** by design. Your ordinary sessions are unaffected.
- **They fail open.** If a guard crashes, the call goes ahead with a visible warning (ADR-0011).
- **They have not been tested under `bypassPermissions`.** Whether a hook denial holds in that mode is unverified (see testing).

## Web research

- Only `factory:research-worker` has `WebSearch` and `WebFetch`. It cannot edit files or run commands, and workers have no web access (ADR-0013).
- `init` does not pre-authorise web tools. Claude Code asks you, as in any session, and your allow and deny rules for domains apply.
- If you have the Context7 MCP server, registered locally as `context7` or connected as the claude.ai connector, the researcher can use it too. Its queries go to Upstash's hosted service, and its content is community-contributed, so the researcher confirms answers in official docs before the work relies on them.
- Search queries leave your machine. The researcher is told to use only public names (packages, APIs, versions) and never repository code, internal names or secrets. That rule lives in the prompt; it is not enforced by a hook.
- Fetched pages are treated as untrusted data, by the researcher and by the orchestrator that reads its note.
- Turn it off with `"roles": { "research-worker": { "enabled": false } }`.

## Figma and design images

- Only `factory:design-worker` has Figma MCP tools. It cannot edit files, run commands or use the web, and workers have no Figma access (ADR-0014).
- It reads only the frames and images your request cites. Layer names, texts and annotations in a design are treated as untrusted data, by the design worker and by the orchestrator that reads its note.
- Screenshots are downloaded by `factory-state fetch-design-image`, which accepts only HTTPS URLs on Figma hosts (or the desktop server on `127.0.0.1:3845`), checks every redirect, keeps only PNG or JPEG files (SVG is refused), stops at 10 MB and never prints the URL's signed query string. When a Figma tool returns a render inline instead of as a URL, the same command copies the file Claude Code saved (`--image`), but only from a session's `tool-results/` folder under the Claude Code config directory, after resolving symlinks, and with the same PNG/JPEG and size checks. It runs under the existing `Bash(factory-state *)` permission, so no `curl` rule is needed.
- The kit does not install a Figma server. Figma calls count against your seat's limits.
- Turn it off with `"roles": { "design-worker": { "enabled": false } }`.

## Secrets

- The default `protectedPaths` cover `.env`, `.env.*` (except `.env.example` and similar templates), `*.pem`, `*.key`, `secrets/` and `credentials*`.
- Workers are told never to read or print them.
- The optional deny rules from `init` enforce the same protection outside workflows. Note that `Read(./.env.*)` also blocks `.env.example`.

## Known limitations (v0.1)

- **Parallel workers share one checkout.** Safety comes from non-overlapping file scopes, which the scheduler checks conservatively. Worktree isolation is off (ADR-0007).
- **Discovery needs you.** `/grill-with-docs` can only be started by you, so FULL-SPEC pauses for it.
- **Spec Kit:** only 1.x is supported, and only `specify`, `clarify` and `plan` are used. Its own task and implement commands overlap with the orchestrator.
- **Model routing passes aliases only.** Organisation policy or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` can override them, and reports record the *requested* model.
- **Real-session evidence is limited.** Each mode has run end to end in single real sessions, and the eval suite is small. See [testing](testing.md) for what has and has not been exercised.
- **Cost.** A FULL-SPEC run with discovery, a spec, several workers and two reviewers can cost tens of dollars: about $17 in our test.
