---
type: llm
---

The assistant inspected the repository and either asked the user which components to install or showed a change plan. Before any file is written, it asks for approval. When a plan is shown, the permission rules `Bash(factory-state *)` and `Edit(/.factory/**)` appear verbatim with a reason. It does not claim that anything was installed or written. It does not tell the user that it edited files itself.
