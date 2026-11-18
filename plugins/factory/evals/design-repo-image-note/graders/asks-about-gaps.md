---
type: llm
---

The final reply pauses the workflow and asks the user about gaps in the design before implementing. It raises at least one of: states the image does not show (for example empty, loading, error or disabled), or a colour in the design that has no matching token in src/ui/theme.js (the light grey chip background). Each question comes with a recommended answer. It does not claim the chips were implemented, and it does not invent a hex value to hard-code.
