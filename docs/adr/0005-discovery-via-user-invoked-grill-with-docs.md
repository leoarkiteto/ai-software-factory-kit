---
status: accepted
---
# FULL-SPEC discovery pauses for the user to invoke `/grill-with-docs`

`grill-with-docs` declares `disable-model-invocation: true`, so Claude Code blocks the model from invoking it. Rather than working around that by calling its constituent skills (`grilling`, `domain-modeling`), the Factory respects the author's intent. It detects the skill (user, project or plugin scope, including the `mattpocock-skills:` namespace), writes a discovery brief, sets the workflow to `DISCOVERING`, and asks the user to type the command. Discovery is complete when the user confirms shared understanding. The Factory then reads the resulting `GLOSSARY.md` and `docs/adr/` changes. If the skill is missing, the Factory explains this and offers a native discovery fallback, and the manifest records which mechanism was actually used.

## Considered Options

- Model-invoke `grilling` and `domain-modeling` directly. Rejected as the default, because it bypasses the provider's declared invocation policy and couples the Factory to its internals.
