import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../plugins/factory/lib/state.mjs";
import { classify, DIMENSIONS } from "../plugins/factory/lib/classify.mjs";
import { loadDefaults, resolveConfig } from "../plugins/factory/lib/contracts.mjs";

const config = loadDefaults();
const T0 = "2026-11-09T10:00:00.000Z";
const scores = (over = {}) => Object.fromEntries(DIMENSIONS.map((d) => [d, over[d] ?? 0]));
const task = (id, dependsOn = [], files = [`src/${id}/**`], role = "backend-worker") =>
  ({ id, title: `task ${id}`, role, dependsOn, status: "pending", scope: { files }, acceptanceCriteria: ["works"] });
const wf = () => S.createWorkflow({ title: "Add partial refunds", request: "Allow partial refunds", config, now: T0 });
const go = (m, to, extra = {}, c = config) => S.transition(m, to, { reason: `to ${to}`, ...extra }, c);

function classified(mode, over = {}) {
  const sc = { quick: scores(), standard: scores({ scope: 1, components: 1, risk: 1, testing: 1, complexity: 1 }), full_spec: scores({ architecturalImpact: 2 }) }[mode];
  return S.setClassification(wf(), classify({ scores: { ...sc, ...over }, confidence: "high", rationale: "r" }, config));
}

function standardExecuting(tasks = [task("T1"), task("T2", ["T1"])]) {
  let m = go(classified("standard"), "planning");
  m = S.setTasks(m, tasks);
  return go(m, "executing");
}

function completeAll(m) {
  for (const t of m.tasks) {
    m = S.updateTask(m, t.id, { status: "running" }, config);
    m = S.updateTask(m, t.id, { status: "completed" }, config);
  }
  return m;
}

const review = (attempt, outcome, kind = "code", independent = true) =>
  ({ attempt, kind, reviewer: `factory:${kind}-reviewer`, outcome, independent, report: `.factory/r/${attempt}-${kind}.json` });

// ------------------------------------------------------------ creation

test("createWorkflow produces a valid manifest with a slugged, unique id", () => {
  const m = wf();
  assert.equal(m.id, "wf-20261109-add-partial-refunds");
  assert.equal(m.status, "classifying");
  assert.equal(m.review.maxIterations, 3);
  assert.deepEqual(S.validateManifest(m), []);
  const again = S.workflowId("Add partial refunds", T0, [m.id]);
  assert.equal(again, `${m.id}-2`);
  assert.equal(S.slugify("Reembolso parcial — ação!"), "reembolso-parcial-acao");
});

// ---------------------------------------------------------- transitions

test("disallowed transitions and missing reasons are rejected", () => {
  const m = classified("standard");
  assert.throws(() => go(m, "completed"), /not allowed/);
  assert.throws(() => S.transition(m, "planning", { reason: " " }, config), /specific reason/);
  assert.throws(() => go(m, "bogus"), /unknown status/);
});

test("modes only visit their own stages", () => {
  const q = classified("quick");
  assert.throws(() => go(q, "planning"), /not visited in mode quick/);
  const s = classified("standard");
  assert.throws(() => go(s, "discovering"), /not visited in mode standard/);
  assert.equal(go(classified("full_spec"), "discovering").status, "discovering");
});

test("mode changes only from classifying or replanning, and are recorded", () => {
  let m = S.setTasks(classified("quick"), [task("T1")]);
  m = go(m, "executing");
  assert.throws(() => go(m, "replanning", { mode: "standard" }), /mode can only change/);
  m = go(m, "replanning");
  m = go(m, "planning", { mode: "standard" });
  assert.equal(m.mode, "standard");
  assert.deepEqual(m.history.at(-1).modeChange, { from: "quick", to: "standard" });
});

test("quick may execute straight from classifying; others must plan", () => {
  const q = S.setTasks(classified("quick"), [task("T1")]);
  assert.equal(go(q, "executing").status, "executing");
  assert.throws(() => go(classified("quick"), "executing"), /no tasks defined/);
  assert.throws(() => go(S.setTasks(classified("standard"), [task("T1")]), "executing"), /only quick/);
});

test("discovery must be completed before specifying; spec before planning", () => {
  let m = go(classified("full_spec"), "discovering");
  assert.throws(() => go(m, "specifying"), /discovery is not completed/);
  m = S.setProvider(m, "discovery", { requested: "grill-with-docs", used: "grill-with-docs", status: "completed", evidence: "GLOSSARY.md changed" });
  m = go(m, "specifying");
  assert.throws(() => go(m, "planning"), /no spec artifact/);
  m = S.setArtifact(m, "spec", ".factory/workflows/x/spec.md");
  assert.equal(go(m, "planning").status, "planning");
});

test("failed is terminal unless the user approves a resume", () => {
  const m = go(classified("standard"), "failed");
  assert.throws(() => go(m, "replanning"), /requires user approval/);
  assert.equal(go(m, "replanning", { userApproved: true }).status, "replanning");
});

test("transitions clear blockedOn and append history", () => {
  let m = go(classified("full_spec"), "discovering");
  m = S.block(m, "discovery_session", "type /grill-with-docs");
  assert.equal(m.blockedOn.kind, "discovery_session");
  assert.equal(S.nextAction(m, config).action, "wait");
  m = S.setProvider(m, "discovery", { status: "completed", used: "native" });
  m = go(m, "specifying");
  assert.equal(m.blockedOn, null);
  assert.deepEqual(m.history.map((h) => h.to), ["classifying", "discovering", "specifying"]);
});

// ------------------------------------------------------------------ DAG

test("DAG validation catches duplicates, unknown, self and cyclic dependencies", () => {
  const msgs = (tasks) => S.validateDag(tasks).map((e) => e.message).join("\n");
  assert.match(msgs([task("T1"), task("T1")]), /duplicate/);
  assert.match(msgs([task("T1", ["T9"])]), /unknown task T9/);
  assert.match(msgs([task("T1", ["T1"])]), /depends on itself/);
  assert.match(msgs([task("T1", ["T3"]), task("T2", ["T1"]), task("T3", ["T2"])]), /cycle: T1 -> T3 -> T2 -> T1/);
  assert.equal(msgs([task("T1"), task("T2", ["T1"]), task("T3", ["T1"]), task("T4", ["T2", "T3"])]), "");
});

test("setTasks rejects cycles and is restricted to planning stages", () => {
  const m = go(classified("standard"), "planning");
  assert.throws(() => S.setTasks(m, [task("T1", ["T2"]), task("T2", ["T1"])]), /manifest invalid/);
  const exec = standardExecuting();
  assert.throws(() => S.setTasks(exec, [task("T1")]), /only be \(re\)defined/);
});

test("validatePlan checks roles, worktree policy and FR coverage", () => {
  let m = go(classified("standard"), "planning");
  m = S.setTasks(m, [{ ...task("T1", [], ["a/**"], "code-reviewer") }, { ...task("T2", [], ["b/**"], "nope") }, { ...task("T3"), isolation: "worktree", requirementRefs: ["FR-1"] }]);
  const { config: noWt } = resolveConfig({ schemaVersion: 1, execution: { worktreeIsolation: "never" } });
  const msgs = S.validatePlan(m, noWt, { requirementIds: ["FR-1", "FR-2", "AC-1"] }).map((e) => e.message).join("\n");
  assert.match(msgs, /code-reviewer is not a worker/);
  assert.match(msgs, /unknown role nope/);
  assert.match(msgs, /worktree isolation is disabled/);
  assert.match(msgs, /FR-2 is not referenced/);
  assert.doesNotMatch(msgs, /FR-1 is not referenced/);
});

// ----------------------------------------------------------- scheduling

test("ready set respects dependencies", () => {
  const m = standardExecuting([task("T1"), task("T2"), task("T3", ["T1", "T2"])]);
  assert.deepEqual(S.readyTasks(m).map((t) => t.id), ["T1", "T2"]);
});

test("schedule parallelises disjoint scopes and defers overlapping ones", () => {
  const m = standardExecuting([task("T1", [], ["src/api/**"]), task("T2", [], ["web/**"]), task("T3", [], ["src/api/refunds.ts"])]);
  const { start, deferred } = S.schedule(m, config);
  assert.deepEqual(start, ["T1", "T2"]);
  assert.deepEqual(deferred, [{ id: "T3", reason: "file scope may overlap with T1" }]);
});

test("schedule honours running tasks, concurrency limit and parallel=false", () => {
  let m = standardExecuting([task("T1", [], ["a/**"]), task("T2", [], ["b/**"]), task("T3", [], ["c/**"]), task("T4", [], ["d/**"])]);
  assert.deepEqual(S.schedule(m, config).start, ["T1", "T2", "T3"], "default maxConcurrentTasks = 3");
  m = S.updateTask(m, "T1", { status: "running" }, config);
  assert.deepEqual(S.schedule(m, config).start, ["T2", "T3"]);
  const { config: serial } = resolveConfig({ schemaVersion: 1, execution: { parallel: false } });
  assert.deepEqual(S.schedule(m, serial).start, []);
  assert.match(S.schedule(m, serial).deferred[0].reason, /parallel execution disabled/);
});

// ---------------------------------------------------------- task status

test("tasks cannot start with unmet dependencies or outside executing", () => {
  const m = standardExecuting();
  assert.throws(() => S.updateTask(m, "T2", { status: "running" }, config), /unmet dependencies: T1/);
  const planning = S.setTasks(go(classified("standard"), "planning"), [task("T1")]);
  assert.throws(() => S.updateTask(planning, "T1", { status: "running" }, config), /only while executing/);
  assert.throws(() => S.updateTask(m, "T1", { status: "completed" }, config), /pending -> completed is not allowed/);
});

test("attempts are counted and bounded; exhausted failure blocks transitive dependants", () => {
  let m = standardExecuting([task("T1"), task("T2", ["T1"]), task("T3", ["T2"]), task("T4")]);
  m = S.updateTask(m, "T1", { status: "running" }, config);
  m = S.updateTask(m, "T1", { status: "failed", result: "tests fail" }, config);
  assert.equal(m.tasks.find((t) => t.id === "T2").status, "pending", "retries remain: no propagation yet");
  m = S.updateTask(m, "T1", { status: "pending" }, config);
  m = S.updateTask(m, "T1", { status: "running" }, config);
  assert.equal(m.tasks[0].attempts, 2);
  m = S.updateTask(m, "T1", { status: "failed" }, config);
  assert.deepEqual(m.tasks.map((t) => t.status), ["failed", "blocked", "blocked", "pending"]);
  assert.match(m.tasks[2].blockedReason, /dependency T1 failed after 2/);
  assert.throws(() => S.updateTask(m, "T1", { status: "pending" }, config), /exhausted/);
  assert.equal(S.nextAction(m, config).action, "run_tasks", "independent T4 still runs");
});

test("blocking a task requires a reason", () => {
  const m = standardExecuting();
  assert.throws(() => S.updateTask(m, "T1", { status: "blocked" }, config), /blockedReason/);
  const b = S.updateTask(m, "T1", { status: "blocked", blockedReason: "needs API key decision" }, config);
  assert.equal(S.updateTask(b, "T1", { status: "pending" }, config).tasks[0].blockedReason, undefined);
});

test("replanning preserves attempts of kept tasks", () => {
  let m = standardExecuting();
  m = S.updateTask(m, "T1", { status: "running" }, config);
  m = S.updateTask(m, "T1", { status: "failed" }, config);
  m = go(m, "replanning");
  m = S.setTasks(m, [{ ...task("T1"), status: "pending" }, task("T5")]);
  assert.equal(m.tasks[0].attempts, 1);
  assert.equal(m.tasks[1].attempts, 0);
});

// --------------------------------------------------------------- review

test("review rounds are numbered and bounded", () => {
  let m = go(completeAll(standardExecuting()), "reviewing");
  assert.throws(() => S.addReview(m, review(2, "APPROVED")), /attempt must be 1/);
  m = S.addReview(m, review(1, "NEEDS_CHANGES"));
  assert.throws(() => S.addReview(m, review(1, "APPROVED")), /already reported/);
  assert.equal(S.reviewDecision(m, config).action, "rework");
  m = go(m, "executing");
  m = S.updateTask(m, "T1", { status: "pending" }, config);
  m = S.updateTask(m, "T1", { status: "running" }, config);
  m = S.updateTask(m, "T1", { status: "completed" }, config);
  m = go(m, "reviewing");
  m = S.addReview(m, review(2, "NEEDS_CHANGES"));
  m = go(m, "executing");
  m = go(m, "reviewing");
  m = S.addReview(m, review(3, "NEEDS_CHANGES"));
  assert.deepEqual(S.reviewDecision(m, config), { action: "escalate", detail: "review iteration limit (3) reached with changes still required" });
  assert.throws(() => go(m, "executing"), /iteration limit reached/);
  assert.throws(() => S.addReview(m, review(4, "APPROVED")), /iteration limit reached/);
});

test("integration requires approved, independent reviews per policy", () => {
  let m = go(completeAll(standardExecuting()), "reviewing");
  assert.throws(() => go(m, "integrating"), /code review required but not performed/);
  m = S.addReview(m, review(1, "APPROVED", "code", false));
  assert.equal(S.reviewDecision(m, config).action, "escalate");
  assert.throws(() => go(m, "integrating"), /not independent/);
  let ok = go(completeAll(standardExecuting()), "reviewing");
  ok = S.addReview(ok, review(1, "APPROVED_WITH_WARNINGS"));
  assert.equal(S.reviewDecision(ok, config).action, "integrate");
  assert.equal(go(ok, "integrating").status, "integrating");
});

test("architecture review is awaited when required", () => {
  let m = go(classified("standard", { risk: 2 }), "planning");
  m = go(S.setTasks(m, [task("T1")]), "executing");
  m = go(completeAll(m), "reviewing");
  m = S.addReview(m, review(1, "APPROVED"));
  assert.deepEqual(S.reviewDecision(m, config), { action: "await_reviews", detail: "missing architecture review" });
  m = S.addReview(m, review(1, "APPROVED", "architecture"));
  assert.equal(S.reviewDecision(m, config).action, "integrate");
});

test("BLOCKED review escalates", () => {
  let m = go(completeAll(standardExecuting()), "reviewing");
  m = S.addReview(m, review(1, "BLOCKED"));
  assert.equal(S.reviewDecision(m, config).action, "escalate");
});

test("quick without risk skips review; with risk it requires one", () => {
  let q = go(S.setTasks(classified("quick"), [task("T1")]), "executing");
  q = completeAll(q);
  assert.equal(S.nextAction(q, config).action, "integrate");
  assert.equal(go(q, "integrating").status, "integrating");
  let r = go(S.setTasks(classified("quick", { risk: 2 }), [task("T1")]), "executing");
  r = completeAll(r);
  assert.equal(S.nextAction(r, config).action, "review");
  assert.throws(() => go(r, "integrating"), /code review required/);
});

// ---------------------------------------------------------- completion

test("completion requires a final report and no failing validation", () => {
  let m = go(S.setTasks(classified("quick"), [task("T1")]), "executing");
  m = go(completeAll(m), "integrating");
  assert.throws(() => go(m, "completed"), /no final report/);
  m = S.setArtifact(m, "finalReport", ".factory/workflows/x/final-report.md");
  m = S.addValidation(m, { kind: "test", command: "npm test", status: "failed", exitCode: 1 });
  assert.throws(() => go(m, "completed"), /validation failing: npm test/);
  m = S.addValidation(m, { kind: "test", command: "npm test", status: "passed", exitCode: 0 });
  assert.equal(go(m, "completed").status, "completed");
});

test("full FULL-SPEC path end to end", () => {
  let m = go(classified("full_spec"), "discovering");
  m = S.setProvider(m, "discovery", { requested: "grill-with-docs", used: "grill-with-docs", status: "completed", evidence: "docs/adr/0004 added" });
  m = go(m, "specifying");
  m = S.setArtifact(m, "spec", ".factory/workflows/x/spec.md");
  m = go(m, "planning");
  m = S.setTasks(m, [task("T1", [], ["src/api/**"]), task("T2", ["T1"], ["web/**"], "frontend-worker"), task("T3", ["T1"], ["tests/**"], "qa-worker")]);
  m = go(m, "executing");
  m = S.updateTask(m, "T1", { status: "running" }, config);
  m = S.updateTask(m, "T1", { status: "completed" }, config);
  assert.deepEqual(S.schedule(m, config).start, ["T2", "T3"], "T2 and T3 run in parallel after T1");
  for (const id of ["T2", "T3"]) {
    m = S.updateTask(m, id, { status: "running" }, config);
    m = S.updateTask(m, id, { status: "completed" }, config);
  }
  m = go(m, "reviewing");
  m = S.addReview(m, review(1, "APPROVED"));
  m = S.addReview(m, review(1, "APPROVED", "architecture"));
  m = go(m, "integrating");
  m = S.setArtifact(m, "finalReport", ".factory/workflows/x/final-report.md");
  m = go(m, "completed");
  assert.deepEqual(m.history.map((h) => h.to), ["classifying", "discovering", "specifying", "planning", "executing", "reviewing", "integrating", "completed"]);
  assert.deepEqual(S.validateManifest(m), []);
});
