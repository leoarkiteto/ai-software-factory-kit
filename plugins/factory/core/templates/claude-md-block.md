## AI Software Factory

Development requests in this repository run through the `factory` plugin. The user types `/factory:start <request>`, and `/factory:resume [ID]` continues a workflow. Workflow state in `.factory/workflows/` changes only through `factory-state`; never edit manifests directly.
