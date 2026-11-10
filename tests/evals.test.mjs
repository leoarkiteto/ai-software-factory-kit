// Structural checks for the behavioural eval suite (plugins/factory/evals/).
// The evals themselves run real sessions and cost money: `claude plugin eval`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expectedScaffolds } from "../scripts/sync-eval-fixtures.mjs";

const EVALS = new URL("../plugins/factory/evals/", import.meta.url).pathname;
// From the plugin-evals docs (Claude Code 2.1.321). Unknown keys are load errors.
const PROMPT_KEYS = new Set(["name", "description", "tags", "plugins", "runs", "expected_outcome", "model", "max_turns",
  "timeout_seconds", "allowed_tools", "append_system_prompt", "env"]);
const GRADER_TYPES = new Set(["regex", "tool_used", "tool_order", "file_exists", "llm", "baseline"]);

const cases = readdirSync(EVALS).filter((d) => existsSync(join(EVALS, d, "prompt.md")));
const fm = (path) => {
  const m = readFileSync(path, "utf8").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `${path}: missing frontmatter`);
  const keys = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) keys[kv[1]] = kv[2];
  }
  return { keys, body: m[2].trim() };
};

test("eval suite has cases", () => assert.ok(cases.length >= 5, cases.join(", ")));

test("every case has valid prompt frontmatter, a body and at least one grader", () => {
  for (const c of cases) {
    const { keys, body } = fm(join(EVALS, c, "prompt.md"));
    for (const k of Object.keys(keys)) assert.ok(PROMPT_KEYS.has(k), `${c}: unknown prompt key ${k}`);
    assert.ok(keys.description, `${c}: description`);
    assert.ok(body, `${c}: empty prompt`);
    const graders = readdirSync(join(EVALS, c, "graders")).filter((f) => f.endsWith(".md"));
    assert.ok(graders.length, `${c}: no graders`);
    for (const g of graders) {
      const { keys: gk, body: gb } = fm(join(EVALS, c, "graders", g));
      assert.ok(GRADER_TYPES.has(gk.type), `${c}/${g}: type ${gk.type}`);
      if (gk.type === "llm") assert.ok(gb, `${c}/${g}: llm grader needs a rubric`);
      if (gk.type === "regex") assert.doesNotThrow(() => new RegExp(JSON.parse(gk.pattern)), `${c}/${g}: pattern`);
    }
  }
});

test("case.yaml references an in-case scaffold that matches the shared fixture", () => {
  const expected = expectedScaffolds();
  for (const c of cases) {
    const yaml = readFileSync(join(EVALS, c, "case.yaml"), "utf8");
    assert.match(yaml, /^schema_version: "1\.1"$/m);
    assert.match(yaml, new RegExp(`^name: ${c}$`, "m"));
    assert.match(yaml, /scaffold_script: scaffold\.sh$/m);
    const path = join(EVALS, c, "scaffold.sh");
    assert.equal(readFileSync(path, "utf8"), expected[path], `${c}: run node scripts/sync-eval-fixtures.mjs`);
    assert.ok(statSync(path).mode & 0o100, `${c}: scaffold.sh not executable`);
  }
});

test("slash-command cases start with the command (otherwise no skill runs)", () => {
  for (const c of cases) {
    const { body } = fm(join(EVALS, c, "prompt.md"));
    if (body.includes("/factory:")) assert.match(body, /^\/factory:/, c);
  }
});
