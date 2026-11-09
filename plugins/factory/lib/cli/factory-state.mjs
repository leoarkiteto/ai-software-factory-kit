// factory-state: the only writer of .factory/workflows/<id>/manifest.json.
// Exit codes: 0 ok, 1 rejected (validation/transition), 2 usage error.

import { readFileSync, rmSync, existsSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import * as S from "../state.mjs";
import * as store from "../store.mjs";
import { loadConfig, checkReviewReport, checkWorkerReport, resolveModel } from "../contracts.mjs";
import { execFileSync } from "node:child_process";
import { classify, needsConfirmation, ClassificationError } from "../classify.mjs";
import { formatErrors } from "../schema.mjs";

const USAGE = `factory-state <command> [args] [--root DIR] [--json]

Workflows
  new --title T (--request TEXT | --request-file F) [--base-ref REF]
  list                                   all workflows with status
  show [ID]                              summary + next action (default: most recent active)
  validate [ID]                          validate manifest(s) and config
  config                                 effective configuration and config errors
  resume-summary                         one line per active workflow (used by hooks)

State
  transition ID STATUS --reason R [--mode M] [--user-approved]
  block ID --kind K --detail D           kinds: user_input user_approval discovery_session external_dependency escalation
  unblock ID
  classify ID --file F                   F: {scores, confidence, rationale, evidence?, discoveryJustified?, forceMode?, forceReason?}

Tasks
  tasks ID --file F                      replace task list (planning / replanning / classifying)
  task ID TASK [--status S] [--result R] [--agent A] [--model M] [--blocked-reason R]
  next ID                                deterministic next action and schedulable tasks
  route ROLE                             agent and model alias for a role (omit model when none)
  report ID TASK --file F                validate + store a worker report (reports/TASK-ATTEMPT.json)

Review, validation, records
  review ID --file F                     validate + store a review report, print the decision
  plan-review ID --file F                validate + store the FULL-SPEC architecture review of the plan
  validation ID --kind K --status S [--command C] [--exit N] [--summary T]   (omit --command only for skipped)
  provider ID discovery|specification [--requested X] [--used X] [--status S] [--version V] [--evidence E] [--note N]
  artifact ID KIND PATH
  issue ID --severity S --description D --source SRC [--task T]

Files given as F may be '-' for stdin (plain text only in heredocs: Claude Code's
permission checker refuses JSON in heredocs). For JSON, write the file to
.factory/workflows/<id>/inbox/<name>.json; it is deleted once accepted.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

function need(flags, name) {
  if (flags[name] === undefined || flags[name] === true) throw new UsageError(`missing --${name}`);
  return flags[name];
}

// Input files read during this invocation; inbox files are deleted on success.
let inputsRead = [];

function readInput(path) {
  if (path !== "-") inputsRead.push(resolve(path));
  let text;
  try {
    text = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  } catch (e) {
    throw new S.StateError(`cannot read input ${path}: ${e.code === "ENOENT" ? "file not found" : e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new S.StateError(`input is not valid JSON: ${e.message}`);
  }
}

/**
 * Inbox convention: callers write JSON to .factory/workflows/<id>/inbox/<name>.json
 * (JSON in heredocs is refused by Claude Code's permission checker) and pass it
 * with --file. Accepted inbox files are deleted; rejected ones stay to be fixed.
 */
export function run(argv, io = {}) {
  inputsRead = [];
  const code = runCommand(argv, io);
  if (code === 0) {
    const { flags } = parseArgs(argv);
    const workflows = resolve(store.workflowsDir(store.findRepoRoot(flags.root)));
    for (const p of inputsRead) {
      const parts = p.startsWith(workflows + sep) ? p.slice(workflows.length + 1).split(sep) : [];
      if (parts.length === 3 && parts[1] === "inbox" && existsSync(p)) {
        rmSync(p);
        const dir = dirname(p);
        if (readdirSync(dir).length === 0) rmdirSync(dir);
      }
    }
  }
  return code;
}

function runCommand(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...args] = positional;
  const out = (human, data) => stdout.write(`${flags.json ? JSON.stringify(data ?? human, null, 2) : human}\n`);

  try {
    if (!command || command === "help" || flags.help) {
      stdout.write(`${USAGE}\n`);
      return command ? 0 : 2;
    }
    const root = store.findRepoRoot(flags.root);
    const { config, errors: configErrors } = loadConfig(root);
    const load = (id) => store.loadManifest(root, id ?? mostRecentActive(root));
    const save = (m) => store.saveManifest(root, m);
    const id = args[0];
    const requireId = () => {
      if (!id) throw new UsageError("missing workflow ID");
      return id;
    };

    switch (command) {
      case "new": {
        const title = need(flags, "title");
        const rf = flags["request-file"];
        const request = rf ? readFileSync(rf === "-" ? 0 : rf, "utf8").trim() : need(flags, "request");
        if (!request) throw new UsageError("empty request");
        const baseRef = typeof flags["base-ref"] === "string" ? flags["base-ref"] : gitHead(root);
        const m = S.createWorkflow({ title, request, config, existingIds: store.listWorkflowIds(root), baseRef });
        save(m);
        out(m.id, { id: m.id, dir: store.workflowDir(root, m.id) });
        return 0;
      }
      case "list": {
        const { workflows, broken } = store.loadAll(root);
        const lines = workflows.map((m) => S.summary(m));
        for (const b of broken) lines.push(`${b.id} BROKEN: ${b.message}`);
        out(lines.join("\n") || "no workflows", { workflows: workflows.map((m) => ({ id: m.id, mode: m.mode, status: m.status, blockedOn: m.blockedOn, updatedAt: m.updatedAt })), broken });
        return broken.length ? 1 : 0;
      }
      case "show": {
        const m = load(id);
        const next = S.nextAction(m, config);
        out(`${S.summary(m)}\nnext: ${next.action} — ${next.detail}`, { manifest: m, next });
        return 0;
      }
      case "validate": {
        const results = [];
        if (configErrors.length) results.push({ target: ".factory/config.json", errors: configErrors });
        const ids = id ? [id] : store.listWorkflowIds(root);
        for (const wid of ids) {
          try {
            store.loadManifest(root, wid);
          } catch (e) {
            results.push({ target: wid, errors: e.errors?.length ? e.errors : [{ path: "$", message: e.message }] });
          }
        }
        const human = results.length
          ? results.map((r) => `${r.target}:\n${formatErrors(r.errors)}`).join("\n")
          : `ok (${ids.length} workflow(s), config ${configErrors.length ? "invalid" : "valid"})`;
        out(human, { ok: results.length === 0, results });
        return results.length ? 1 : 0;
      }
      case "config": {
        out(JSON.stringify(config, null, 2) + (configErrors.length ? `\nCONFIG ERRORS (defaults in use):\n${formatErrors(configErrors)}` : ""), { config, errors: configErrors });
        return configErrors.length ? 1 : 0;
      }
      case "resume-summary": {
        const active = store.activeWorkflows(root);
        const lines = active.map((m) => {
          const n = S.nextAction(m, config);
          return `${S.summary(m)} | next: ${n.action}`;
        });
        out(lines.join("\n"), { active: active.map((m) => ({ id: m.id, summary: S.summary(m), next: S.nextAction(m, config) })) });
        return 0;
      }
      case "route": {
        const role = args[0];
        if (!role) throw new UsageError("usage: route ROLE");
        const r = config.roles[role];
        if (!r) throw new S.StateError(`unknown role ${role}`);
        if (r.enabled === false) throw new S.StateError(`role ${role} is disabled in config`);
        const model = resolveModel(config, role);
        out(`agent ${r.agent}  model ${model ?? "(agent default: omit the model parameter)"}`, { role, agent: r.agent, kind: r.kind, model });
        return 0;
      }
      case "plan-review": {
        const m0 = load(requireId());
        if (m0.status !== "planning") throw new S.StateError(`plan reviews happen while planning (current: ${m0.status})`);
        const report = readInput(need(flags, "file"));
        const errors = checkReviewReport(report);
        if (report.kind !== "architecture") errors.push({ path: "$.kind", message: "plan review must be kind architecture" });
        if (errors.length) throw new S.StateError("plan review rejected", errors);
        const rel = `${store.FACTORY_DIR}/workflows/${m0.id}/plan-review.json`;
        store.writeJsonAtomic(join(root, rel), report);
        save(S.setArtifact(m0, "planReview", rel));
        const required = report.findings.filter((f) => f.required).map((f) => f.id);
        out(`plan review: ${report.outcome}${required.length ? ` — resolve required findings ${required.join(", ")} before approval` : ""}`, { path: rel, outcome: report.outcome, requiredFindings: required });
        return 0;
      }
      case "transition": {
        const to = args[1];
        if (!to) throw new UsageError("missing target status");
        const m = S.transition(load(requireId()), to, { reason: need(flags, "reason"), mode: flags.mode, userApproved: flags["user-approved"] === true }, config);
        save(m);
        out(S.summary(m), { manifest: m, next: S.nextAction(m, config) });
        return 0;
      }
      case "block": {
        const m = save(S.block(load(requireId()), need(flags, "kind"), need(flags, "detail")));
        out(S.summary(m), m);
        return 0;
      }
      case "unblock": {
        const m = save(S.unblock(load(requireId())));
        out(S.summary(m), m);
        return 0;
      }
      case "classify": {
        const m0 = load(requireId());
        const c = classify(readInput(need(flags, "file")), config);
        const m = save(S.setClassification(m0, c));
        const confirm = needsConfirmation(c, config);
        out(`mode ${c.mode} (suggested ${c.suggestedMode}, total ${c.total}, confidence ${c.confidence})${confirm ? "\nconfirm the mode with the user before proceeding" : ""}`, { classification: c, needsConfirmation: confirm });
        return 0;
      }
      case "tasks": {
        const m0 = load(requireId());
        const input = readInput(need(flags, "file"));
        const tasks = Array.isArray(input) ? input : input.tasks;
        const m = S.setTasks(m0, tasks);
        const planErrors = S.validatePlan(m, config);
        if (planErrors.length) throw new S.StateError("plan invalid", planErrors);
        save(m);
        out(`${m.tasks.length} task(s) recorded`, { tasks: m.tasks });
        return 0;
      }
      case "task": {
        const taskId = args[1];
        if (!taskId) throw new UsageError("missing task ID");
        const patch = { status: flags.status, result: flags.result, agent: flags.agent, model: flags.model, blockedReason: flags["blocked-reason"] };
        for (const k of Object.keys(patch)) if (patch[k] === undefined || patch[k] === true) delete patch[k];
        if (patch.model === "null") patch.model = null;
        const m = save(S.updateTask(load(requireId()), taskId, patch, config));
        const t = m.tasks.find((x) => x.id === taskId);
        out(`${taskId} ${t.status} (attempt ${t.attempts ?? 0})`, { task: t, next: S.nextAction(m, config) });
        return 0;
      }
      case "next": {
        const m = load(requireId());
        const n = S.nextAction(m, config);
        out(`${n.action}: ${n.detail}${n.deferred?.length ? `\ndeferred: ${n.deferred.map((d) => `${d.id} (${d.reason})`).join("; ")}` : ""}`, n);
        return 0;
      }
      case "report": {
        const taskId = args[1];
        if (!taskId) throw new UsageError("missing task ID");
        const m0 = load(requireId());
        const task = m0.tasks.find((t) => t.id === taskId);
        if (!task) throw new S.StateError(`unknown task ${taskId}`);
        const report = readInput(need(flags, "file"));
        const errors = checkWorkerReport(report, task);
        if (errors.length) throw new S.StateError("worker report rejected", errors);
        if (report.attempt !== task.attempts) throw new S.StateError(`report attempt ${report.attempt} does not match task attempt ${task.attempts}`);
        const rel = `${store.FACTORY_DIR}/workflows/${m0.id}/reports/${taskId}-${report.attempt}.json`;
        store.writeJsonAtomic(join(root, rel), report);
        const m = save(S.updateTask(m0, taskId, { report: rel }, config));
        out(`stored ${rel}`, { path: rel, next: S.nextAction(m, config) });
        return 0;
      }
      case "review": {
        const m0 = load(requireId());
        const report = readInput(need(flags, "file"));
        const errors = checkReviewReport(report);
        if (errors.length) throw new S.StateError("review report rejected", errors);
        const rel = `${store.FACTORY_DIR}/workflows/${m0.id}/reviews/${report.attempt}-${report.kind}.json`;
        const entry = { attempt: report.attempt, kind: report.kind, reviewer: report.reviewer, outcome: report.outcome, independent: report.independence.independent, report: rel };
        const m = S.addReview(m0, entry);
        store.writeJsonAtomic(join(root, rel), report);
        save(m);
        const decision = S.reviewDecision(m, config);
        out(`${report.kind} review attempt ${report.attempt}: ${report.outcome}\ndecision: ${decision.action} — ${decision.detail}`, { path: rel, decision });
        return 0;
      }
      case "validation": {
        const kind = need(flags, "kind");
        const status = need(flags, "status");
        let command = typeof flags.command === "string" ? flags.command.trim() : "";
        if (["null", "none", "undefined", "-"].includes(command.toLowerCase())) {
          throw new UsageError(`--command "${command}" is not a command; omit --command for an unconfigured kind`);
        }
        if (!command) {
          if (status !== "skipped") throw new UsageError("missing --command (only --status skipped may omit it)");
          command = `${kind}: not configured`;
        }
        const result = { kind, command, status };
        if (flags.exit !== undefined) result.exitCode = Number(flags.exit);
        if (flags.summary) result.summary = flags.summary;
        const m = save(S.addValidation(load(requireId()), result));
        out(`recorded ${result.kind}: ${result.status}`, m.validation.at(-1));
        return 0;
      }
      case "provider": {
        const which = args[1];
        if (which !== "discovery" && which !== "specification") throw new UsageError("provider must be discovery or specification");
        const value = {};
        for (const k of ["requested", "used", "status", "version", "evidence", "note"]) {
          if (typeof flags[k] === "string") value[k] = flags[k] === "null" ? null : flags[k];
        }
        const m = save(S.setProvider(load(requireId()), which, value));
        out(`${which}: ${JSON.stringify(m.providers[which])}`, m.providers[which]);
        return 0;
      }
      case "artifact": {
        const [, kind, path] = args;
        if (!kind || !path) throw new UsageError("usage: artifact ID KIND PATH");
        const m = save(S.setArtifact(load(requireId()), kind, store.repoRelative(root, path)));
        out(`${kind}: ${JSON.stringify(m.artifacts[kind])}`, m.artifacts);
        return 0;
      }
      case "issue": {
        const issue = { severity: need(flags, "severity"), description: need(flags, "description"), source: need(flags, "source") };
        if (flags.task) issue.taskId = flags.task;
        const m = save(S.addIssue(load(requireId()), issue));
        out(`recorded ${m.issues.at(-1).id}`, m.issues.at(-1));
        return 0;
      }
      default:
        throw new UsageError(`unknown command ${command}`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      stderr.write(`usage error: ${e.message}\n\n${USAGE}\n`);
      return 2;
    }
    if (e instanceof S.StateError || e instanceof ClassificationError) {
      const detail = e.errors?.length ? `\n${formatErrors(e.errors)}` : "";
      if (flags.json) stdout.write(`${JSON.stringify({ error: e.message, errors: e.errors ?? [] }, null, 2)}\n`);
      else stderr.write(`rejected: ${e.message}${detail}\n`);
      return 1;
    }
    throw e;
  }
}

function gitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined; // not a git repo, or no commits yet
  }
}

function mostRecentActive(root) {
  const [m] = store.activeWorkflows(root);
  if (!m) throw new S.StateError("no active workflow; pass an ID");
  return m.id;
}
