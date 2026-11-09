import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIMENSIONS } from "../plugins/factory/lib/classify.mjs";

const PLUGIN = new URL("../plugins/factory/", import.meta.url).pathname;
let repo, installed, cli;

before(() => {
  repo = mkdtempSync(join(tmpdir(), "factory-cli-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  // Simulate an installed plugin: a copy outside any package.json with "type": "module".
  installed = mkdtempSync(join(tmpdir(), "factory-cli-plugin-"));
  cpSync(PLUGIN, join(installed, "factory"), { recursive: true });
  cli = join(installed, "factory", "bin", "factory-state");
});
after(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(installed, { recursive: true, force: true });
});

function fs(args, input) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(cli, [...args, "--root", repo], { encoding: "utf8", input, env });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
const json = (args, input) => {
  const r = fs([...args, "--json"], input);
  return { ...r, data: r.out ? JSON.parse(r.out) : null };
};
const file = (name, value) => {
  const p = join(repo, name);
  writeFileSync(p, JSON.stringify(value));
  return p;
};
const scores = (over = {}) => Object.fromEntries(DIMENSIONS.map((d) => [d, over[d] ?? 0]));

test("launcher runs as an installed plugin and shows usage", () => {
  assert.equal(fs([]).code, 2);
  assert.match(fs(["help"]).out, /factory-state <command>/);
  assert.equal(fs(["frobnicate"]).code, 2);
});

test("STANDARD workflow through the CLI, with validation at every write", () => {
  const { data: created } = json(["new", "--title", "Order filters", "--request", "Add a status filter to the orders list"]);
  const id = created.id;
  assert.match(id, /^wf-\d{8}-order-filters$/);
  assert.ok(existsSync(join(repo, ".factory", "workflows", id, "manifest.json")));

  const c = json(["classify", id, "--file", file("c.json", { scores: scores({ scope: 1, components: 1, risk: 1, testing: 1, complexity: 1 }), confidence: "high", rationale: "API + UI" })]);
  assert.equal(c.data.classification.mode, "standard");

  // Reason is mandatory; illegal transitions exit 1.
  assert.equal(fs(["transition", id, "planning"]).code, 2);
  const bad = fs(["transition", id, "completed", "--reason", "skip"]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /not allowed/);
  assert.equal(fs(["transition", id, "planning", "--reason", "classified standard"]).code, 0);

  const cyclic = [
    { id: "T1", title: "api", role: "backend-worker", dependsOn: ["T2"], status: "pending", scope: { files: ["src/**"] }, acceptanceCriteria: ["a"] },
    { id: "T2", title: "ui", role: "frontend-worker", dependsOn: ["T1"], status: "pending", scope: { files: ["web/**"] }, acceptanceCriteria: ["b"] },
  ];
  const r1 = fs(["tasks", id, "--file", file("t.json", cyclic)]);
  assert.equal(r1.code, 1);
  assert.match(r1.err, /cycle/);

  const tasks = [
    { id: "T1", title: "api", role: "backend-worker", dependsOn: [], status: "pending", scope: { files: ["src/**"] }, acceptanceCriteria: ["filter param"] },
    { id: "T2", title: "ui", role: "frontend-worker", dependsOn: [], status: "pending", scope: { files: ["web/**"] }, acceptanceCriteria: ["dropdown"] },
  ];
  assert.equal(fs(["tasks", id, "--file", file("t.json", tasks)]).code, 0);
  assert.equal(fs(["transition", id, "executing", "--reason", "plan approved by user"]).code, 0);

  const next = json(["next", id]);
  assert.deepEqual(next.data.tasks, ["T1", "T2"]);

  for (const t of ["T1", "T2"]) assert.equal(fs(["task", id, t, "--status", "running", "--agent", `factory:${t === "T1" ? "backend" : "frontend"}-worker`, "--model", "sonnet"]).code, 0);

  // Worker report: undeclared out-of-scope file is rejected.
  const report = { schemaVersion: 1, taskId: "T1", attempt: 1, agent: "factory:backend-worker", status: "completed", summary: "done",
    filesChanged: [{ path: "src/orders.ts", change: "modified" }, { path: "web/x.ts", change: "modified" }], tests: [], scopeDeviations: [] };
  const rej = fs(["report", id, "T1", "--file", "-"], JSON.stringify(report));
  assert.equal(rej.code, 1);
  assert.match(rej.err, /outside task scope/);
  report.filesChanged.pop();
  assert.equal(fs(["report", id, "T1", "--file", "-"], JSON.stringify(report)).code, 0);
  assert.ok(existsSync(join(repo, ".factory", "workflows", id, "reports", "T1-1.json")));

  for (const t of ["T1", "T2"]) assert.equal(fs(["task", id, t, "--status", "completed", "--result", "ok"]).code, 0);
  assert.equal(json(["next", id]).data.action, "review");
  assert.equal(fs(["transition", id, "reviewing", "--reason", "all tasks completed"]).code, 0);

  const rev = { schemaVersion: 1, kind: "code", reviewer: "factory:code-reviewer", attempt: 1, outcome: "APPROVED",
    independence: { independent: true, implementedBy: ["factory:backend-worker", "factory:frontend-worker"] },
    subject: { taskIds: ["T1", "T2"] }, findings: [], validationStatus: { status: "passed" } };
  // A reviewer claiming independence while being an implementer is rejected.
  const selfRev = json(["review", id, "--file", "-"], JSON.stringify({ ...rev, reviewer: "factory:backend-worker" }));
  assert.equal(selfRev.code, 1);
  assert.match(JSON.stringify(selfRev.data.errors), /not independent/);
  const ok = json(["review", id, "--file", "-"], JSON.stringify(rev));
  assert.equal(ok.data.decision.action, "integrate");

  assert.equal(fs(["transition", id, "integrating", "--reason", "code review approved"]).code, 0);
  assert.equal(fs(["validation", id, "--kind", "test", "--command", "npm test", "--status", "passed", "--exit", "0"]).code, 0);
  mkdirSync(join(repo, ".factory", "workflows", id), { recursive: true });
  assert.equal(fs(["artifact", id, "finalReport", `.factory/workflows/${id}/final-report.md`]).code, 0);
  assert.equal(fs(["artifact", id, "finalReport", "../outside.md"]).code, 1, "paths outside the repo are rejected");
  assert.equal(fs(["transition", id, "completed", "--reason", "final validation passed"]).code, 0);

  const shown = json(["show", id]);
  assert.equal(shown.data.manifest.status, "completed");
  assert.equal(fs(["validate"]).code, 0);
});

test("discovery pause is visible to resume-summary", () => {
  const { data } = json(["new", "--title", "Refund ledger", "--request", "Partial refunds"]);
  json(["classify", data.id, "--file", file("c2.json", { scores: scores({ architecturalImpact: 2 }), confidence: "high", rationale: "new ledger model" })]);
  assert.equal(fs(["transition", data.id, "discovering", "--reason", "classified full_spec"]).code, 0);
  fs(["provider", data.id, "discovery", "--requested", "grill-with-docs", "--status", "pending"]);
  fs(["block", data.id, "--kind", "discovery_session", "--detail", "user to run /grill-with-docs"]);
  const s = fs(["resume-summary"]);
  assert.match(s.out, /FULL-SPEC\] DISCOVERING .*waiting on discovery_session.*next: wait/);
  const refused = fs(["transition", data.id, "specifying", "--reason", "skip discovery"]);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /discovery is not completed/);
});

test("a corrupted manifest is reported, never silently used", () => {
  const { data } = json(["new", "--title", "Broken", "--request", "x"]);
  const p = join(repo, ".factory", "workflows", data.id, "manifest.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.status = "done";
  writeFileSync(p, JSON.stringify(m));
  const v = fs(["validate", data.id]);
  assert.equal(v.code, 1);
  assert.match(v.out, /must be one of/);
  assert.equal(fs(["transition", data.id, "planning", "--reason", "x"]).code, 1);
  assert.match(fs(["list"]).out, /BROKEN/);
});

test("invalid repo config falls back to defaults and is reported", () => {
  mkdirSync(join(repo, ".factory"), { recursive: true });
  writeFileSync(join(repo, ".factory", "config.json"), JSON.stringify({ schemaVersion: 1, review: { maxIterations: 99 } }));
  const r = json(["config"]);
  assert.equal(r.code, 1);
  assert.equal(r.data.config.review.maxIterations, 3);
  assert.ok(r.data.errors.length > 0);
  rmSync(join(repo, ".factory", "config.json"));
});

test("validation records: unconfigured kinds need no command; 'null' is refused", () => {
  const { data } = json(["new", "--title", "Validation records", "--request", "x"]);
  assert.equal(fs(["validation", data.id, "--kind", "lint", "--command", "null", "--status", "skipped"]).code, 2);
  assert.equal(fs(["validation", data.id, "--kind", "test", "--status", "passed"]).code, 2, "passed needs a command");
  const r = json(["validation", data.id, "--kind", "lint", "--status", "skipped"]);
  assert.equal(r.data.command, "lint: not configured");
  json(["validation", data.id, "--kind", "build", "--status", "skipped"]);
  const m = json(["show", data.id]).data.manifest;
  assert.deepEqual(m.validation.map((v) => v.command), ["lint: not configured", "build: not configured"], "distinct entries");
});

test("request text is stored verbatim from stdin", () => {
  const text = 'Keep "quotes", $vars and `ticks`\nsecond line';
  const r = json(["new", "--title", "Verbatim", "--request-file", "-"], text);
  assert.equal(json(["show", r.data.id]).data.manifest.request, text);
  assert.equal(fs(["new", "--title", "Empty", "--request-file", "-"], "  ").code, 2);
});

test("inbox files are consumed on success and kept on rejection", () => {
  const { data } = json(["new", "--title", "Inbox", "--request", "x"]);
  const inbox = join(repo, ".factory", "workflows", data.id, "inbox");
  mkdirSync(inbox, { recursive: true });
  const bad = join(inbox, "classification.json");
  writeFileSync(bad, JSON.stringify({ scores: { scope: 9 }, confidence: "high", rationale: "x" }));
  assert.equal(fs(["classify", data.id, "--file", bad]).code, 1);
  assert.ok(existsSync(bad), "rejected input is kept for fixing");
  writeFileSync(bad, JSON.stringify({ scores: scores(), confidence: "high", rationale: "tiny" }));
  assert.equal(fs(["classify", data.id, "--file", bad]).code, 0);
  assert.ok(!existsSync(bad), "accepted input is deleted");
  assert.ok(!existsSync(inbox), "empty inbox directory is removed");
  const outside = file("keep.json", { scores: scores(), confidence: "high", rationale: "x" });
  const other = json(["new", "--title", "Inbox other", "--request", "x"]).data.id;
  assert.equal(fs(["classify", other, "--file", outside]).code, 0);
  assert.ok(existsSync(outside), "files outside an inbox are never deleted");
});

test("route resolves agent and model alias per role", () => {
  assert.deepEqual(json(["route", "backend-worker"]).data, { role: "backend-worker", agent: "factory:backend-worker", kind: "worker", model: "sonnet" });
  assert.equal(json(["route", "code-reviewer"]).data.model, "opus");
  assert.equal(fs(["route", "nope"]).code, 1);
});

test("new records the git HEAD as baseRef when available", () => {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const { data } = json(["new", "--title", "Base ref", "--request", "x"]);
  assert.equal(json(["show", data.id]).data.manifest.baseRef, head);
});

test("a missing input file is a clean rejection, not a crash", () => {
  const { data } = json(["new", "--title", "Missing input", "--request", "x"]);
  const r = fs(["classify", data.id, "--file", join(repo, "nope.json")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /cannot read input .*file not found/);
  assert.doesNotMatch(r.err, /at readFileSync/);
});
