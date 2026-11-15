---
status: accepted
---
# External documentation comes from a read-only researcher, and workers stay offline

Workers implement from the model's own knowledge of a framework, which can be out of date for the version a repository pins. Next.js caching is a typical case: `fetch` cache options, `unstable_cache`, and the `"use cache"` directive with `cacheLife`/`cacheTag` replaced each other within a few major versions. The kit adds a `research-worker` role of a new kind, `researcher`, that the orchestrator may dispatch during planning (or the focused analysis of QUICK). It pins the dependency versions from the repository's manifest and lockfile, reads the official documentation for those versions, and returns a cited research note. The orchestrator saves the note under `.factory/workflows/<id>/research/`, records it as the list artifact `research`, and passes its conclusions to workers through task constraints and the brief, and to reviewers through the review brief.

## Decisions

- **A separate role, not web tools on every worker.** Workers keep `Read, Grep, Glob, Edit, Write, Bash` and no web access. Web content is an injection channel. Keeping it in an agent that cannot write files or run commands limits what a malicious page can do, and the research is recorded once, where reviewers can check its sources.
- **A new kind, `researcher`.** A researcher changes no files, so it cannot follow the worker contract (scope, `filesChanged`, tests) or the reviewer contract. `validatePlan` already rejects DAG tasks whose role is not a worker, so a researcher can never be given an implementation task.
- **Tools `Read, Grep, Glob, WebSearch, WebFetch`, no Bash.** Without Bash it cannot run `factory-state guide`, so its contract lives in the agent prompt itself.
- **Model tier `light` (Haiku).** The work is retrieval and summary against named questions, not design. The orchestrator, on the reasoning tier, writes the questions and checks the note before relying on it. Repositories can move the role to another tier in config.
- **A Markdown note, not a JSON report.** The note is advice for humans, workers and reviewers. Nothing in the state machine depends on its contents, so there is no schema to validate. Its quality checks (versions match the lockfile, every answer cites a fetched source) are made by the orchestrator, as the research procedure says.
- **Optional, in every mode.** Research runs only when the work depends on version-sensitive external APIs that the repository has no working example of. It does not add a workflow stage or an approval.

## Consequences

- WebSearch and WebFetch are not pre-authorised by `init`. The user sees Claude Code's usual permission prompts, and can allow or deny domains as for any session.
- Search queries leave the machine. The procedure and the agent prompt forbid putting repository code, internal names or secrets in briefs, queries or URLs, but this is a prompt-level rule, not an enforced one.
- The guard hooks do not match WebSearch or WebFetch. They still guard the researcher's `Read` calls against protected paths.
- Disabling the role (`roles.research-worker.enabled: false`) makes the orchestrator record the plan's reliance on unverified knowledge as a risk instead.
