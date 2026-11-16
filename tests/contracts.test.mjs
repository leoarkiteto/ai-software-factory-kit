import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SchemaRegistry, SchemaError, formatErrors } from "../plugins/factory/lib/schema.mjs";
import {
  schemas, schemaId, SCHEMA_DIR, loadDefaults, resolveConfig, resolveModel,
  checkReviewReport, checkWorkerReport, deepMerge,
} from "../plugins/factory/lib/contracts.mjs";

const FIXTURES = new URL("./fixtures/contracts/", import.meta.url).pathname;
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const schemaFor = (file) => schemaId(file.split(".")[0]);

test("every schema loads, uses only supported keywords and resolves its $refs", () => {
  const reg = SchemaRegistry.fromDirectory(SCHEMA_DIR);
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"));
  assert.equal(reg.schemas.size, files.length);
});

test("validator rejects unsupported keywords instead of ignoring them", () => {
  const reg = new SchemaRegistry();
  assert.throws(() => reg.add({ $id: "x", type: "object", oneOf: [] }), SchemaError);
  assert.throws(() => reg.add({ $id: "y", type: "string", format: "email" }), SchemaError);
});

for (const file of readdirSync(join(FIXTURES, "valid"))) {
  test(`valid fixture passes: ${file}`, () => {
    const errors = schemas().validate(schemaFor(file), load(join(FIXTURES, "valid", file)));
    assert.deepEqual(errors, [], formatErrors(errors));
  });
}

for (const file of readdirSync(join(FIXTURES, "invalid"))) {
  test(`invalid fixture fails with expected error: ${file}`, () => {
    const { _expect, ...doc } = load(join(FIXTURES, "invalid", file));
    const errors = schemas().validate(schemaFor(file), doc);
    assert.ok(errors.length > 0, "expected validation errors");
    assert.ok(errors.some((e) => e.message.includes(_expect)), `expected "${_expect}" in:\n${formatErrors(errors)}`);
  });
}

test("defaults.json is a valid config and semantically consistent", () => {
  const defaults = loadDefaults();
  const { $schema, ...rest } = defaults;
  assert.deepEqual(schemas().validate(schemaId("config"), defaults), []);
  const { errors } = resolveConfig({ schemaVersion: 1 }, defaults);
  assert.deepEqual(errors, []);
  assert.ok(rest.review.maxIterations === 3, "default review iteration limit is 3");
});

test("repo config deep-merges over defaults; arrays replace", () => {
  const { config, errors, source } = resolveConfig(load(join(FIXTURES, "valid", "config.custom.json")));
  assert.deepEqual(errors, []);
  assert.equal(source, "repo");
  assert.equal(config.models.tiers.efficient, "haiku");
  assert.equal(config.models.tiers.reasoning, "opus", "untouched tier keeps default");
  assert.equal(config.roles["frontend-worker"].enabled, false);
  assert.equal(config.roles["frontend-worker"].agent, "factory:frontend-worker");
  assert.deepEqual(config.validation.preReview, ["lint", "test"]);
  assert.equal(config.review.architecture.full_spec, "always");
  assert.equal(config.review.architecture.standard, "always");
  assert.deepEqual(deepMerge({ a: [1, 2] }, { a: [3] }), { a: [3] });
});

test("invalid repo config falls back to defaults and reports errors", () => {
  const { errors, source } = resolveConfig({ schemaVersion: 1, review: { maxIterations: 0 } });
  assert.equal(source, "defaults");
  assert.ok(errors.length > 0);
});

test("semantic config errors are reported", () => {
  const cases = [
    [{ schemaVersion: 1, classification: { thresholds: { standard: 8, fullSpec: 6 } } }, "fullSpec must be greater"],
    [{ schemaVersion: 1, roles: { "x-worker": { model: "sonnet" } } }, "needs an agent"],
    [{ schemaVersion: 1, roles: { "code-reviewer": { enabled: false }, "architecture-reviewer": { enabled: false } } }, "at least one reviewer"],
  ];
  for (const [raw, expect] of cases) {
    const { errors } = resolveConfig(raw);
    assert.ok(errors.some((e) => e.message.includes(expect)), `${expect}: ${formatErrors(errors)}`);
  }
});

test("model routing resolves tiers, aliases and agent defaults", () => {
  const { config } = resolveConfig(load(join(FIXTURES, "valid", "config.custom.json")));
  assert.equal(resolveModel(config, "backend-worker"), "haiku", "efficient tier overridden to haiku");
  assert.equal(resolveModel(config, "code-reviewer"), "opus");
  assert.equal(resolveModel(config, "api-worker"), "sonnet", "direct alias");
  const { config: c2 } = resolveConfig({ schemaVersion: 1, roles: { "qa-worker": { model: null } } });
  assert.equal(resolveModel(c2, "qa-worker"), null, "null means agent frontmatter default");
  assert.equal(resolveModel(c2, "unknown-role"), null);
});

test("review outcome must agree with findings", () => {
  const base = load(join(FIXTURES, "valid", "review-report.needs-changes.json"));
  assert.deepEqual(checkReviewReport(base), []);
  const approvedWithRequired = { ...base, outcome: "APPROVED" };
  assert.ok(checkReviewReport(approvedWithRequired).some((e) => e.message.includes("required findings")));
  const noRequired = { ...base, findings: base.findings.map((f) => ({ ...f, required: false })) };
  assert.ok(checkReviewReport(noRequired).some((e) => e.message.includes("NEEDS_CHANGES needs")));
  const warnings = { ...noRequired, outcome: "APPROVED_WITH_WARNINGS", findings: [noRequired.findings[1]] };
  assert.deepEqual(checkReviewReport(warnings), []);
  const blocked = { ...base, outcome: "BLOCKED" };
  assert.ok(checkReviewReport(blocked).some((e) => e.message.includes("blockedReason")));
});

test("a reviewer that also implemented cannot claim independence", () => {
  const base = load(join(FIXTURES, "valid", "review-report.needs-changes.json"));
  const selfReview = { ...base, reviewer: "factory:backend-worker" };
  assert.ok(checkReviewReport(selfReview).some((e) => e.message.includes("not independent")));
  const honest = { ...selfReview, independence: { ...selfReview.independence, independent: false } };
  assert.deepEqual(checkReviewReport(honest), []);
});

test("worker report must declare files outside task scope", () => {
  const manifest = load(join(FIXTURES, "valid", "manifest.full-spec-executing.json"));
  const task = manifest.tasks[0];
  const report = load(join(FIXTURES, "valid", "worker-report.completed.json"));
  assert.deepEqual(checkWorkerReport(report, task), []);
  const strayed = { ...report, filesChanged: [...report.filesChanged, { path: "src/ledger/index.ts", change: "modified" }] };
  assert.ok(checkWorkerReport(strayed, task).some((e) => e.message.includes("outside task scope")));
  const declared = { ...strayed, scopeDeviations: [{ path: "src/ledger/index.ts", reason: "export needed helper" }] };
  assert.deepEqual(checkWorkerReport(declared, task), []);
  assert.ok(checkWorkerReport({ ...report, taskId: "T9" }, task).some((e) => e.message.includes("expected T1")));
});

test("requirement IDs accept Factory and Spec Kit forms", () => {
  const ok = (id) => schemas().validate(schemaId("task"), { id: "T1", title: "t", role: "qa-worker", dependsOn: [], status: "pending", scope: { files: ["x"] }, acceptanceCriteria: ["x"], requirementRefs: [id] });
  for (const id of ["FR-1", "FR-001", "NFR-2", "AC-10", "SC-004"]) assert.deepEqual(ok(id), [], id);
  for (const id of ["REQ-1", "FR1", "fr-1"]) assert.ok(ok(id).length > 0, id);
});

test("task DAG references in fixtures use known task IDs", () => {
  const manifest = load(join(FIXTURES, "valid", "manifest.full-spec-executing.json"));
  const ids = new Set(manifest.tasks.map((t) => t.id));
  for (const t of manifest.tasks) for (const d of t.dependsOn) assert.ok(ids.has(d), `${t.id} -> ${d}`);
});

// The reviewer contract shows the report as one JSON example (not parseable:
// it holds placeholders). Keep the keys of its requirementsCoverage and
// findings items, and the prose that spells them out, equal to the schema.
test("reviewer contract shows exactly the schema's keys for coverage items and findings", () => {
  const contract = readFileSync(new URL("../plugins/factory/core/agents/reviewer-contract.md", import.meta.url), "utf8");
  const props = load(join(SCHEMA_DIR, "review-report.schema.json")).properties;
  const schemaKeys = (name) => Object.keys(props[name].items.properties).sort();
  const exampleKeys = (name) => {
    const line = contract.split("\n").find((l) => l.trim().startsWith(`"${name}": [{`));
    assert.ok(line, `example line for ${name}`);
    return [...line.matchAll(/"(\w+)":/g)].map((m) => m[1]).filter((k) => k !== name).sort();
  };
  const proseKeys = (marker) => {
    const line = contract.split("\n").find((l) => l.startsWith(`- a \`${marker}\` item has`));
    assert.ok(line, `prose line for ${marker}`);
    return [...line.split(". It never")[0].matchAll(/`(\w+)`/g)].map((m) => m[1]).filter((k) => k !== marker).sort();
  };
  for (const name of ["requirementsCoverage", "findings"]) {
    assert.deepEqual(exampleKeys(name), schemaKeys(name), `${name}: example keys`);
    assert.deepEqual(proseKeys(name), schemaKeys(name), `${name}: prose keys`);
  }
});

// The worker contract's report example must show the item shape of each
// object array, so a worker never has to guess it (an empty `[]` left
// scopeDeviations undocumented and workers sent strings or extra keys).
test("worker contract shows exactly the schema's keys for object array items", () => {
  const contract = readFileSync(new URL("../plugins/factory/core/agents/worker-contract.md", import.meta.url), "utf8");
  const props = load(join(SCHEMA_DIR, "worker-report.schema.json")).properties;
  const exampleKeys = (name) => {
    const line = contract.split("\n").find((l) => l.trim().startsWith(`"${name}": [{`));
    assert.ok(line, `example line for ${name}`);
    return [...line.matchAll(/"(\w+)":/g)].map((m) => m[1]).filter((k) => k !== name).sort();
  };
  for (const name of ["filesChanged", "acceptanceCriteria", "scopeDeviations"]) {
    assert.deepEqual(exampleKeys(name), Object.keys(props[name].items.properties).sort(), `${name}: example keys`);
  }
  const prose = contract.split("\n").find((l) => l.startsWith("- a `scopeDeviations` item has"));
  assert.ok(prose, "prose line for scopeDeviations");
  assert.deepEqual([...prose.split(". It is never")[0].matchAll(/`(\w+)`/g)].map((m) => m[1]).filter((k) => k !== "scopeDeviations").sort(),
    Object.keys(props.scopeDeviations.items.properties).sort(), "scopeDeviations: prose keys");
});

test("the research-worker is a read-only researcher on the light tier", () => {
  const defaults = loadDefaults();
  const role = defaults.roles["research-worker"];
  assert.deepEqual(role, { agent: "factory:research-worker", kind: "researcher", model: "light", enabled: true });
  assert.equal(resolveModel(defaults, "research-worker"), "haiku");
  const { errors } = resolveConfig({ schemaVersion: 1, roles: { "docs-researcher": { agent: "docs-researcher", kind: "researcher" } } });
  assert.deepEqual(errors, [], "custom researcher roles validate");

  const agent = readFileSync(new URL("../plugins/factory/agents/research-worker.md", import.meta.url), "utf8");
  const tools = agent.match(/^tools: (.+)$/m)[1].split(/,\s*/);
  assert.deepEqual(tools.sort(), ["Glob", "Grep", "Read", "WebFetch", "WebSearch", "mcp__claude_ai_Context7__*", "mcp__context7__*"], "web tools and optional Context7, no write or shell tools");
  assert.match(agent, /^model: haiku$/m);
});
