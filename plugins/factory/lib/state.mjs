// Workflow state machine, task DAG and review accounting
// (docs/contracts/workflow-state.md). Pure functions: every operation takes a
// manifest and returns a new one, or throws StateError. No I/O here.

import { schemas, schemaId } from "./contracts.mjs";
import { globsMayOverlap } from "./glob.mjs";
import { reviewRequired } from "./classify.mjs";

export class StateError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

export const TRANSITIONS = {
  classifying: ["discovering", "planning", "executing", "failed"],
  discovering: ["specifying", "failed"],
  specifying: ["planning", "discovering", "failed"],
  planning: ["executing", "specifying", "failed"],
  executing: ["reviewing", "integrating", "replanning", "failed"],
  reviewing: ["executing", "replanning", "integrating", "failed"],
  replanning: ["planning", "executing", "failed"],
  integrating: ["completed", "executing", "replanning", "failed"],
  completed: [],
  failed: ["replanning"],
};

const COMMON = ["classifying", "executing", "reviewing", "replanning", "integrating", "completed", "failed"];
export const MODE_STATUSES = {
  quick: new Set(COMMON),
  standard: new Set([...COMMON, "planning"]),
  full_spec: new Set([...COMMON, "planning", "discovering", "specifying"]),
};

export const TERMINAL = new Set(["completed", "failed"]);
const APPROVED = new Set(["APPROVED", "APPROVED_WITH_WARNINGS"]);

const nowIso = () => new Date().toISOString();
const clone = (m) => structuredClone(m);

// ------------------------------------------------------------- creation

export function slugify(text) {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40).replace(/-+$/, "") || "workflow";
}

export function workflowId(title, now = nowIso(), existing = []) {
  const base = `wf-${now.slice(0, 10).replace(/-/g, "")}-${slugify(title)}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) if (!existing.includes(`${base}-${n}`)) return `${base}-${n}`;
}

export function createWorkflow({ title, request, config, now = nowIso(), existingIds = [], baseRef }) {
  const m = {
    schemaVersion: 1,
    id: workflowId(title, now, existingIds),
    title: title.slice(0, 120),
    request,
    mode: "quick",
    status: "classifying",
    blockedOn: null,
    createdAt: now,
    updatedAt: now,
    providers: {
      discovery: { requested: null, used: null, status: "not_applicable" },
      specification: { requested: null, used: null, status: "not_applicable" },
    },
    tasks: [],
    review: { attempts: 0, maxIterations: config.review.maxIterations, history: [] },
    validation: [],
    issues: [],
    artifacts: {},
    history: [{ at: now, to: "classifying", reason: "workflow created" }],
  };
  if (baseRef) m.baseRef = baseRef;
  return assertValid(m);
}

// ----------------------------------------------------------- validation

export function validateManifest(m) {
  const errors = schemas().validate(schemaId("manifest"), m);
  if (errors.length) return errors;
  errors.push(...validateDag(m.tasks));
  if (!MODE_STATUSES[m.mode].has(m.status)) {
    errors.push({ path: "$.status", message: `status ${m.status} is not visited in mode ${m.mode}` });
  }
  if (m.review.attempts > m.review.maxIterations) {
    errors.push({ path: "$.review.attempts", message: "attempts exceed maxIterations" });
  }
  return errors;
}

function assertValid(m) {
  const errors = validateManifest(m);
  if (errors.length) throw new StateError("manifest invalid", errors);
  return m;
}

/** Duplicate IDs, unknown/self dependencies and cycles. */
export function validateDag(tasks) {
  const errors = [];
  const ids = new Map();
  tasks.forEach((t, i) => {
    if (ids.has(t.id)) errors.push({ path: `$.tasks[${i}].id`, message: `duplicate task id ${t.id}` });
    ids.set(t.id, t);
  });
  tasks.forEach((t, i) => {
    for (const d of t.dependsOn) {
      if (d === t.id) errors.push({ path: `$.tasks[${i}].dependsOn`, message: `${t.id} depends on itself` });
      else if (!ids.has(d)) errors.push({ path: `$.tasks[${i}].dependsOn`, message: `${t.id} depends on unknown task ${d}` });
    }
  });
  if (errors.length) return errors;

  const state = new Map(); // id -> "visiting" | "done"
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    stack.push(id);
    for (const d of ids.get(id).dependsOn) {
      const cycle = visit(d);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const t of tasks) {
    const cycle = visit(t.id);
    if (cycle) {
      errors.push({ path: "$.tasks", message: `dependency cycle: ${cycle.join(" -> ")}` });
      break;
    }
  }
  return errors;
}

/** Plan-level checks used before planning -> executing. */
export function validatePlan(m, config, { requirementIds = [] } = {}) {
  const errors = validateDag(m.tasks);
  if (m.tasks.length === 0) errors.push({ path: "$.tasks", message: "plan has no tasks" });
  for (const [i, t] of m.tasks.entries()) {
    const role = config.roles?.[t.role];
    if (!role) errors.push({ path: `$.tasks[${i}].role`, message: `unknown role ${t.role}` });
    else if (role.enabled === false) errors.push({ path: `$.tasks[${i}].role`, message: `role ${t.role} is disabled` });
    else if (role.kind !== "worker") errors.push({ path: `$.tasks[${i}].role`, message: `role ${t.role} is not a worker` });
    if (t.isolation === "worktree" && config.execution.worktreeIsolation === "never") {
      errors.push({ path: `$.tasks[${i}].isolation`, message: "worktree isolation is disabled by config" });
    }
  }
  const referenced = new Set(m.tasks.flatMap((t) => t.requirementRefs ?? []));
  for (const r of requirementIds.filter((r) => r.startsWith("FR-"))) {
    if (!referenced.has(r)) errors.push({ path: "$.tasks", message: `${r} is not referenced by any task` });
  }
  return errors;
}

// ---------------------------------------------------------- transitions

function latestRound(m) {
  return m.review.history.filter((h) => h.attempt === m.review.attempts);
}

/** Guards beyond the transition table. Returns a list of reasons it is not allowed. */
function guardFailures(m, to, config, { userApproved = false } = {}) {
  const failures = [];
  const tasks = m.tasks;
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === "completed");
  const from = m.status;

  if (to === "specifying" && from === "discovering" && m.providers.discovery.status !== "completed") {
    failures.push("discovery is not completed (providers.discovery.status)");
  }
  if (to === "planning" && from === "specifying" && !m.artifacts.spec) {
    failures.push("no spec artifact recorded");
  }
  if (to === "executing" && (from === "planning" || from === "replanning" || from === "classifying")) {
    if (from === "classifying" && m.mode !== "quick") failures.push("only quick workflows execute without planning");
    if (tasks.length === 0) failures.push("no tasks defined");
    const dag = validateDag(tasks);
    if (dag.length) failures.push(...dag.map((e) => e.message));
  }
  if (to === "executing" && from === "reviewing") {
    const round = latestRound(m);
    if (!round.some((h) => h.outcome === "NEEDS_CHANGES")) failures.push("latest review round has no NEEDS_CHANGES outcome");
    if (m.review.attempts >= m.review.maxIterations) failures.push(`review iteration limit reached (${m.review.maxIterations}); escalate instead`);
  }
  if (to === "reviewing" && !allDone) failures.push("not all tasks are completed");
  if (to === "integrating") {
    if (!allDone) failures.push("not all tasks are completed");
    // The user may accept the risk of unapproved reviews after an escalation.
    if (config && !userApproved) {
      const needed = ["code", "architecture"].filter((k) => reviewRequired(k, m.mode, m.classification, config));
      const round = latestRound(m);
      for (const kind of needed) {
        const reviews = round.filter((h) => h.kind === kind);
        if (!reviews.length) failures.push(`${kind} review required but not performed in the current round`);
        else if (!reviews.every((h) => APPROVED.has(h.outcome))) failures.push(`${kind} review not approved`);
        else if (config.review.requireIndependentReviewer && m.mode !== "quick" && reviews.some((h) => h.independent === false)) {
          failures.push(`${kind} review was not independent`);
        }
      }
    }
  }
  if (to === "completed") {
    if (!m.artifacts.finalReport) failures.push("no final report recorded");
    const failed = latestValidation(m).filter((v) => v.status === "failed");
    if (failed.length) failures.push(`validation failing: ${failed.map((v) => v.command).join(", ")}`);
  }
  return failures;
}

/**
 * Move the workflow to `to`.
 * opts: { reason (required), now, mode (mode change), userApproved, blockedOn }
 */
export function transition(m, to, opts = {}, config) {
  const { reason, now = nowIso(), mode, userApproved = false } = opts;
  if (!reason || !reason.trim()) throw new StateError("a transition needs a specific reason");
  const from = m.status;
  if (!(to in TRANSITIONS)) throw new StateError(`unknown status ${to}`);
  if (!TRANSITIONS[from].includes(to)) throw new StateError(`transition ${from} -> ${to} is not allowed`);
  if (from === "failed" && !userApproved) throw new StateError("resuming a failed workflow requires user approval");

  let targetMode = m.mode;
  if (mode && mode !== m.mode) {
    if (from !== "classifying" && from !== "replanning") {
      throw new StateError(`mode can only change from classifying or replanning (current: ${from})`);
    }
    targetMode = mode;
  }
  if (!MODE_STATUSES[targetMode].has(to)) throw new StateError(`status ${to} is not visited in mode ${targetMode}`);

  const next = clone(m);
  next.mode = targetMode;
  const failures = guardFailures(next, to, config, { userApproved });
  if (failures.length) throw new StateError(`cannot move ${from} -> ${to}: ${failures.join("; ")}`, failures.map((message) => ({ path: "$", message })));

  next.status = to;
  next.blockedOn = opts.blockedOn ?? null;
  next.updatedAt = now;
  const entry = { at: now, from, to, reason };
  if (targetMode !== m.mode) entry.modeChange = { from: m.mode, to: targetMode };
  next.history.push(entry);
  return assertValid(next);
}

export function block(m, kind, detail, now = nowIso()) {
  const next = clone(m);
  next.blockedOn = { kind, detail, since: now };
  next.updatedAt = now;
  return assertValid(next);
}

export function unblock(m, now = nowIso()) {
  const next = clone(m);
  next.blockedOn = null;
  next.updatedAt = now;
  return assertValid(next);
}

// --------------------------------------------------------- task updates

export function setTasks(m, tasks, now = nowIso()) {
  if (!["planning", "replanning", "classifying"].includes(m.status)) {
    throw new StateError(`tasks can only be (re)defined while planning, replanning or classifying (current: ${m.status})`);
  }
  const previous = new Map(m.tasks.map((t) => [t.id, t]));
  const next = clone(m);
  // Completed work is preserved across replanning unless the task is redefined as pending explicitly.
  next.tasks = tasks.map((t) => ({ attempts: previous.get(t.id)?.attempts ?? 0, failures: previous.get(t.id)?.failures ?? 0, ...t }));
  next.updatedAt = now;
  return assertValid(next);
}

const TASK_TRANSITIONS = {
  pending: ["running", "blocked"],
  running: ["completed", "failed", "blocked", "pending"],
  failed: ["pending"],
  blocked: ["pending"],
  completed: ["pending"],
};

/**
 * Update one task. patch: { status, result, report, agent, model, blockedReason }
 * Starting a task (-> running) increments attempts and requires its deps completed.
 * A failed task with exhausted attempts blocks its transitive dependants.
 */
export function updateTask(m, taskId, patch, config, now = nowIso()) {
  const next = clone(m);
  const task = next.tasks.find((t) => t.id === taskId);
  if (!task) throw new StateError(`unknown task ${taskId}`);
  const maxAttempts = config?.execution?.maxTaskAttempts ?? 2;

  if (patch.status && patch.status !== task.status) {
    if (!TASK_TRANSITIONS[task.status].includes(patch.status)) {
      throw new StateError(`task ${taskId}: ${task.status} -> ${patch.status} is not allowed`);
    }
    if (patch.status === "running") {
      if (next.status !== "executing") throw new StateError(`tasks run only while executing (current: ${next.status})`);
      const unmet = task.dependsOn.filter((d) => next.tasks.find((t) => t.id === d).status !== "completed");
      if (unmet.length) throw new StateError(`task ${taskId} has unmet dependencies: ${unmet.join(", ")}`);
      if ((task.failures ?? 0) >= maxAttempts) throw new StateError(`task ${taskId} exhausted ${maxAttempts} failed attempts`);
      task.attempts = (task.attempts ?? 0) + 1;
    }
    if (patch.status === "failed") task.failures = (task.failures ?? 0) + 1;
    if (patch.status === "pending" && task.status === "failed" && (task.failures ?? 0) >= maxAttempts) {
      throw new StateError(`task ${taskId} exhausted ${maxAttempts} failed attempts; replan instead`);
    }
    if (patch.status === "pending" && task.status === "completed" && !["executing", "replanning"].includes(next.status)) {
      throw new StateError("reopening a completed task requires executing or replanning");
    }
    if (patch.status === "blocked" && !patch.blockedReason && !task.blockedReason) {
      throw new StateError(`task ${taskId}: blocking requires a blockedReason`);
    }
    task.status = patch.status;
    if (patch.status !== "blocked") delete task.blockedReason;
  }
  if (patch.result !== undefined) task.result = patch.result;
  if (patch.blockedReason !== undefined) task.blockedReason = patch.blockedReason;
  if (patch.report) task.reports = [...(task.reports ?? []), patch.report];
  if (patch.agent) task.assignment = { agent: patch.agent, model: patch.model ?? null };

  if (task.status === "failed" && (task.failures ?? 0) >= maxAttempts) {
    for (const id of dependantsOf(next.tasks, taskId)) {
      const d = next.tasks.find((t) => t.id === id);
      if (d.status === "pending") {
        d.status = "blocked";
        d.blockedReason = `dependency ${taskId} failed ${task.failures} time(s)`;
      }
    }
  }
  next.updatedAt = now;
  return assertValid(next);
}

/** Transitive dependants of a task. */
export function dependantsOf(tasks, taskId) {
  const out = new Set();
  const queue = [taskId];
  while (queue.length) {
    const id = queue.shift();
    for (const t of tasks) {
      if (t.dependsOn.includes(id) && !out.has(t.id)) {
        out.add(t.id);
        queue.push(t.id);
      }
    }
  }
  return [...out];
}

// ------------------------------------------------------------ scheduling

export function readyTasks(m) {
  const status = new Map(m.tasks.map((t) => [t.id, t.status]));
  return m.tasks.filter((t) => t.status === "pending" && t.dependsOn.every((d) => status.get(d) === "completed"));
}

/**
 * Choose which ready tasks to start now.
 * Returns { start: [taskId], deferred: [{ id, reason }] }.
 */
export function schedule(m, config) {
  const running = m.tasks.filter((t) => t.status === "running");
  const ready = readyTasks(m);
  const { parallel, maxConcurrentTasks } = config.execution;
  const limit = parallel ? maxConcurrentTasks : 1;
  const start = [];
  const deferred = [];
  const active = [...running];

  for (const t of ready) {
    if (active.length >= limit) {
      deferred.push({ id: t.id, reason: parallel ? `concurrency limit ${limit} reached` : "parallel execution disabled" });
      continue;
    }
    const conflict = active.find((a) => globsMayOverlap(a.scope.files, t.scope.files));
    if (conflict) {
      deferred.push({ id: t.id, reason: `file scope may overlap with ${conflict.id}` });
      continue;
    }
    start.push(t.id);
    active.push(t);
  }
  return { start, deferred };
}

// --------------------------------------------------------------- reviews

/**
 * Record one review report in the current or a new round.
 * entry: { attempt, kind, reviewer, outcome, independent, report }
 */
export function addReview(m, entry, now = nowIso()) {
  // Plan reviews (FULL-SPEC) are recorded as the planReview artifact, not as review rounds.
  if (m.status !== "reviewing") throw new StateError(`reviews are recorded while reviewing (current: ${m.status})`);
  const next = clone(m);
  const { attempts, maxIterations } = next.review;
  if (entry.attempt === attempts + 1) {
    if (attempts >= maxIterations) throw new StateError(`review iteration limit reached (${maxIterations})`);
    next.review.attempts = entry.attempt;
  } else if (entry.attempt !== attempts || attempts === 0) {
    throw new StateError(`review attempt must be ${attempts === 0 ? 1 : `${attempts} or ${attempts + 1}`}, got ${entry.attempt}`);
  }
  if (next.review.history.some((h) => h.attempt === entry.attempt && h.kind === entry.kind && h.reviewer === entry.reviewer)) {
    throw new StateError(`${entry.reviewer} already reported a ${entry.kind} review for attempt ${entry.attempt}`);
  }
  next.review.history.push(entry);
  next.updatedAt = now;
  return assertValid(next);
}

/**
 * What to do after the current review round.
 * Returns { action: "integrate" | "rework" | "escalate" | "await_reviews", detail }.
 */
export function reviewDecision(m, config) {
  const round = latestRound(m);
  const needed = ["code", "architecture"].filter((k) => reviewRequired(k, m.mode, m.classification, config));
  const missing = needed.filter((k) => !round.some((h) => h.kind === k));
  if (round.some((h) => h.outcome === "BLOCKED")) return { action: "escalate", detail: "a reviewer returned BLOCKED" };
  if (round.some((h) => h.outcome === "NEEDS_CHANGES")) {
    return m.review.attempts < m.review.maxIterations
      ? { action: "rework", detail: `review round ${m.review.attempts} of ${m.review.maxIterations} needs changes` }
      : { action: "escalate", detail: `review iteration limit (${m.review.maxIterations}) reached with changes still required` };
  }
  if (missing.length) return { action: "await_reviews", detail: `missing ${missing.join(", ")} review` };
  if (config.review.requireIndependentReviewer && m.mode !== "quick" && round.some((h) => h.independent === false)) {
    return { action: "escalate", detail: "review was not independent" };
  }
  return { action: "integrate", detail: "all required reviews approved" };
}

// ------------------------------------------------------------ validation

export function addValidation(m, result, now = nowIso()) {
  const next = clone(m);
  next.validation.push({ at: now, ...result });
  next.updatedAt = now;
  return assertValid(next);
}

/** Latest result per command. */
export function latestValidation(m) {
  const latest = new Map();
  for (const v of m.validation) latest.set(v.command, v);
  return [...latest.values()];
}

// ---------------------------------------------------- misc record keeping

export function setProvider(m, which, value, now = nowIso()) {
  const next = clone(m);
  next.providers[which] = { ...next.providers[which], ...value };
  next.updatedAt = now;
  return assertValid(next);
}

export function setArtifact(m, kind, path, now = nowIso()) {
  const next = clone(m);
  if (kind === "adrs") next.artifacts.adrs = [...new Set([...(next.artifacts.adrs ?? []), ...[].concat(path)])];
  else next.artifacts[kind] = path;
  next.updatedAt = now;
  return assertValid(next);
}

export function setClassification(m, classification, now = nowIso()) {
  if (m.status !== "classifying" && m.status !== "replanning") {
    throw new StateError(`classification can only be set while classifying or replanning (current: ${m.status})`);
  }
  const next = clone(m);
  next.classification = classification;
  if (m.status === "classifying") next.mode = classification.mode;
  next.updatedAt = now;
  return assertValid(next);
}

export function addIssue(m, issue, now = nowIso()) {
  const next = clone(m);
  const n = next.issues.length + 1;
  next.issues.push({ id: `I${n}`, status: "open", ...issue });
  next.updatedAt = now;
  return assertValid(next);
}

// ------------------------------------------------------------- summaries

/** Deterministic next-step hint for the orchestrator skill and resume hook. */
export function nextAction(m, config) {
  if (m.blockedOn) return { action: "wait", detail: `${m.blockedOn.kind}: ${m.blockedOn.detail}` };
  switch (m.status) {
    case "classifying": return { action: "classify", detail: m.classification ? "classification recorded; transition to the first stage" : "score the rubric" };
    case "discovering": return { action: "discover", detail: `discovery provider ${m.providers.discovery.requested ?? "?"} status ${m.providers.discovery.status}` };
    case "specifying": return { action: "specify", detail: m.artifacts.spec ? "run the spec completeness check" : "write the specification" };
    case "planning": return { action: "plan", detail: m.tasks.length ? "get plan approval, then execute" : "produce plan and task DAG" };
    case "replanning": return { action: "replan", detail: "revise plan or tasks" };
    case "executing": {
      const interrupted = m.tasks.filter((t) => t.status === "running");
      const blocked = m.tasks.filter((t) => t.status === "blocked");
      const failed = m.tasks.filter((t) => t.status === "failed");
      if (m.tasks.length && m.tasks.every((t) => t.status === "completed")) {
        const needsReview = ["code", "architecture"].some((k) => reviewRequired(k, m.mode, m.classification, config));
        return { action: needsReview ? "review" : "integrate", detail: "all tasks completed" };
      }
      const { start, deferred } = schedule(m, config);
      if (start.length) return { action: "run_tasks", tasks: start, deferred, detail: `start ${start.join(", ")}` };
      if (interrupted.length) return { action: "await_tasks", tasks: interrupted.map((t) => t.id), detail: "tasks running (or interrupted: inspect git status before retrying)" };
      const maxAttempts = config?.execution?.maxTaskAttempts ?? 2;
      const retryable = failed.filter((t) => (t.failures ?? 0) < maxAttempts);
      if (retryable.length) return { action: "retry_tasks", tasks: retryable.map((t) => t.id), detail: `set ${retryable.map((t) => t.id).join(", ")} to pending and re-run with the failure feedback` };
      if (failed.length || blocked.length) return { action: "replan", detail: `failed: ${failed.map((t) => t.id).join(", ") || "none"}; blocked: ${blocked.map((t) => t.id).join(", ") || "none"}` };
      return { action: "await_tasks", detail: "nothing ready" };
    }
    case "reviewing": return { action: "review", ...reviewDecision(m, config) };
    case "integrating": return { action: "integrate", detail: m.artifacts.finalReport ? "final report written; complete" : "run final validation and write the final report" };
    case "completed": return { action: "none", detail: "workflow completed" };
    case "failed": return { action: "none", detail: "workflow failed; resume only with user approval" };
  }
  return { action: "none", detail: "" };
}

export function summary(m) {
  const counts = {};
  for (const t of m.tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const tasks = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", ") || "no tasks";
  const blocked = m.blockedOn ? ` | waiting on ${m.blockedOn.kind}: ${m.blockedOn.detail}` : "";
  return `${m.id} [${m.mode.toUpperCase().replace("_", "-")}] ${m.status.toUpperCase()} | tasks: ${tasks} | reviews: ${m.review.attempts}/${m.review.maxIterations}${blocked}`;
}
