// The plan and spec templates carry an optional `## Diagrams` section. These
// checks keep its rules in step across both templates and the guides: the same
// Mermaid diagram types everywhere, and the fixed "text wins" line that stays
// in every filled-in document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sections, checkLocalSpec } from "../plugins/factory/lib/spec.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const TYPES = ["flowchart", "sequenceDiagram", "stateDiagram-v2", "erDiagram", "classDiagram"];
const TEMPLATES = ["plugins/factory/core/templates/plan.md", "plugins/factory/core/templates/spec.md"];
const GUIDES = ["docs/guide/usage.md", "docs/guide/usage.pt-br.md"];

const typesIn = (text) => [...text.matchAll(/`(\w[\w-]*)`/g)].map((m) => m[1]).filter((t) => /diagram|flowchart/i.test(t));

test("plan and spec templates have an optional Diagrams section with the same rules", () => {
  for (const file of TEMPLATES) {
    const body = sections(read(file)).diagrams;
    assert.ok(body !== undefined, `${file}: missing "## Diagrams (optional)"`);
    assert.deepEqual(typesIn(body), TYPES, `${file}: diagram types`);
    assert.match(body, /^Illustrative only: .+ the text wins and the diagram is fixed\.$/m, `${file}: fixed "text wins" line`);
    assert.match(body, /No styling|without styling/, `${file}: no-styling rule`);
  }
});

test("the usage guides list the same diagram types as the templates", () => {
  for (const file of GUIDES) {
    const text = read(file);
    for (const t of TYPES) assert.ok(text.includes(`\`${t}\``), `${file}: missing ${t}`);
    assert.match(text, /ARCHIFY_UPDATE_CHECK_DISABLED=1/, `${file}: Archify update-check note`);
    assert.match(text, /`\.archify\/`/, `${file}: Archify .gitignore note`);
  }
});

test("a local spec with a filled Diagrams section still passes spec-check", () => {
  const spec = read("tests/fixtures/spec/local-complete.md").replace(
    "## Constraints and assumptions",
    [
      "## Diagrams (optional)",
      "Illustrative only: the requirements and acceptance criteria above are the spec of record. If a diagram disagrees with them, the text wins and the diagram is fixed.",
      "",
      "```mermaid",
      "stateDiagram-v2",
      "  [*] --> Requested",
      "  Requested --> Refunded: FR-1",
      "```",
      "",
      "## Constraints and assumptions",
    ].join("\n"),
  );
  assert.ok(sections(spec).diagrams !== undefined);
  assert.deepEqual(checkLocalSpec(spec).errors, []);
});
