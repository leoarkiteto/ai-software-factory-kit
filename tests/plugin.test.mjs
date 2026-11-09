// Structural checks Claude Code does not do for us: unknown frontmatter
// keys are silently ignored, and broken ${CLAUDE_PLUGIN_ROOT} references only
// fail at runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const PLUGIN = join(ROOT, "plugins/factory");

// Verified against code.claude.com docs (skills, sub-agents) for Claude Code 2.1.319.
const SKILL_KEYS = new Set(["name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation",
  "user-invocable", "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent", "background", "hooks",
  "paths", "shell", "metadata", "license", "compatibility"]);
const PLUGIN_AGENT_KEYS = new Set(["name", "description", "model", "effort", "maxTurns", "autoCompactWindow", "tools",
  "disallowedTools", "skills", "memory", "background", "omitClaudeMd", "isolation", "color", "experimental"]);
const MODEL_VALUES = new Set(["sonnet", "opus", "haiku", "fable", "inherit"]);

function frontmatter(path) {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${path}: missing frontmatter`);
  const fields = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { fields, body: text.slice(m[0].length) };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("marketplace lists the plugin at an existing path with a matching name", () => {
  const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
  const plugin = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"));
  const entry = market.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, "plugin listed in marketplace");
  assert.ok(existsSync(join(ROOT, entry.source)), "source path exists");
  assert.match(plugin.version, /^\d+\.\d+\.\d+/);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.equal(plugin.version, pkg.version, "plugin.json and package.json versions agree");
});

const skillDirs = readdirSync(join(PLUGIN, "skills"));
for (const dir of skillDirs) {
  test(`skill ${dir}: frontmatter uses only known keys`, () => {
    const { fields } = frontmatter(join(PLUGIN, "skills", dir, "SKILL.md"));
    for (const k of Object.keys(fields)) assert.ok(SKILL_KEYS.has(k), `unknown key "${k}"`);
    assert.equal(fields.name, dir, "name matches directory");
    assert.ok(fields.description?.length > 20, "description present");
    assert.ok(fields.description.length <= 1536, "description within listing limit");
  });
}

test("entry skills are user-invoked only, so the Factory never hijacks ordinary requests", () => {
  for (const dir of ["start", "resume"]) {
    assert.equal(frontmatter(join(PLUGIN, "skills", dir, "SKILL.md")).fields["disable-model-invocation"], "true", dir);
  }
});

const agentsDir = join(PLUGIN, "agents");
if (existsSync(agentsDir)) {
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    test(`agent ${file}: frontmatter valid for plugin agents`, () => {
      const { fields } = frontmatter(join(agentsDir, file));
      for (const k of Object.keys(fields)) assert.ok(PLUGIN_AGENT_KEYS.has(k), `key "${k}" unknown or ignored for plugin agents`);
      assert.equal(`${fields.name}.md`, file);
      assert.ok(fields.description);
      if (fields.model) assert.ok(MODEL_VALUES.has(fields.model), `model ${fields.model}`);
    });
  }
}

test("every ${CLAUDE_PLUGIN_ROOT}/ reference in plugin markdown resolves", () => {
  const missing = [];
  for (const file of walk(PLUGIN).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(file, "utf8");
    for (const [, ref] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+[A-Za-z0-9_])/g)) {
      if (!existsSync(join(PLUGIN, ref))) missing.push(`${relative(PLUGIN, file)} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every `factory-state guide NAME` reference resolves to a core file", () => {
  const missing = [];
  let count = 0;
  for (const file of walk(PLUGIN).filter((f) => f.endsWith(".md"))) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(/factory-state guide ([A-Za-z0-9_/-]+)/g)) {
      count++;
      if (!existsSync(join(PLUGIN, "core", `${name}.md`))) missing.push(`${relative(PLUGIN, file)} -> ${name}`);
    }
  }
  assert.ok(count > 20, `expected many guide references, found ${count}`);
  assert.deepEqual(missing, []);
});

test("orchestrator-facing files never read plugin files by path", () => {
  const offenders = walk(PLUGIN).filter((f) => f.endsWith(".md") && !f.endsWith("README.md") && /\$\{CLAUDE_PLUGIN_ROOT\}\/core\//.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map((f) => relative(PLUGIN, f)), []);
});

test("bin/ entries are executable", () => {
  for (const f of readdirSync(join(PLUGIN, "bin"))) {
    assert.ok(statSync(join(PLUGIN, "bin", f)).mode & 0o111, `${f} not executable`);
  }
});

test("placeholder procedures are clearly marked as not yet available", () => {
  for (const f of readdirSync(join(PLUGIN, "core/workflows"))) {
    const text = readFileSync(join(PLUGIN, "core/workflows", f), "utf8");
    if (text.includes("not yet available")) assert.match(text, /Do \*\*not\*\* improvise/, f);
  }
});
