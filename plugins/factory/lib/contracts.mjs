// Semantic contract rules that JSON Schema cannot express, plus config loading.
// Every check returns an array of { path, message }; empty means valid.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaRegistry } from "./schema.mjs";
import { matchesAny } from "./glob.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA_DIR = join(PLUGIN_ROOT, "core", "schemas");
export const DEFAULTS_PATH = join(PLUGIN_ROOT, "core", "defaults.json");

let registry;
export function schemas() {
  registry ??= SchemaRegistry.fromDirectory(SCHEMA_DIR);
  return registry;
}

export const schemaId = (name) => `factory/${name}.schema.json`;

// ---------------------------------------------------------------- config

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge plain objects; arrays and scalars from `override` replace. */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out && isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

export function loadDefaults() {
  return JSON.parse(readFileSync(DEFAULTS_PATH, "utf8"));
}

/**
 * Resolve the effective config for a repository.
 * Returns { config, errors, source } where errors cover both the repo file
 * (schema) and the merged result (semantics).
 */
export function loadConfig(repoRoot) {
  const path = join(repoRoot, ".factory", "config.json");
  const defaults = loadDefaults();
  if (!existsSync(path)) {
    return { config: defaults, errors: checkConfigSemantics(defaults), source: "defaults" };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { config: defaults, errors: [{ path: ".factory/config.json", message: `invalid JSON: ${e.message}` }], source: "defaults" };
  }
  return resolveConfig(raw, defaults);
}

export function resolveConfig(raw, defaults = loadDefaults()) {
  const errors = schemas().validate(schemaId("config"), raw);
  if (errors.length) return { config: defaults, errors, source: "defaults" };
  const config = deepMerge(defaults, raw);
  return { config, errors: checkConfigSemantics(config), source: "repo" };
}

export function checkConfigSemantics(config) {
  const errors = [];
  const t = config.classification?.thresholds ?? {};
  if (t.standard !== undefined && t.fullSpec !== undefined && t.fullSpec <= t.standard) {
    errors.push({ path: "$.classification.thresholds", message: "fullSpec must be greater than standard" });
  }
  for (const [name, role] of Object.entries(config.roles ?? {})) {
    if (role.enabled === false) continue;
    if (!role.agent) errors.push({ path: `$.roles.${name}`, message: "enabled role needs an agent" });
    if (!role.kind) errors.push({ path: `$.roles.${name}`, message: "enabled role needs a kind (worker|reviewer)" });
  }
  const enabledReviewers = Object.values(config.roles ?? {}).filter((r) => r.enabled !== false && r.kind === "reviewer");
  if (enabledReviewers.length === 0) {
    errors.push({ path: "$.roles", message: "at least one reviewer role must be enabled" });
  }
  for (const kind of [...(config.validation?.preReview ?? []), ...(config.validation?.final ?? [])]) {
    if (!(kind in (config.validation?.commands ?? {}))) {
      errors.push({ path: "$.validation", message: `unknown command kind "${kind}"` });
    }
  }
  return errors;
}

const TIERS = new Set(["reasoning", "efficient", "light"]);

/**
 * Model alias to pass as the Agent tool's `model` parameter for a role,
 * or null to let the agent's frontmatter default apply.
 */
export function resolveModel(config, roleName) {
  const ref = config.roles?.[roleName]?.model ?? null;
  if (ref === null) return null;
  return TIERS.has(ref) ? config.models?.tiers?.[ref] ?? null : ref;
}

// --------------------------------------------------------------- reports

/** Rules tying the review outcome to its findings. */
export function checkReviewReport(report) {
  const errors = schemas().validate(schemaId("review-report"), report);
  if (errors.length) return errors;
  const required = report.findings.filter((f) => f.required);
  const severe = report.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  switch (report.outcome) {
    case "APPROVED":
      if (required.length) errors.push({ path: "$.outcome", message: "APPROVED cannot have required findings" });
      if (severe.length) errors.push({ path: "$.outcome", message: "APPROVED cannot have critical/high findings" });
      break;
    case "APPROVED_WITH_WARNINGS":
      if (required.length) errors.push({ path: "$.outcome", message: "APPROVED_WITH_WARNINGS cannot have required findings" });
      if (report.findings.length === 0) errors.push({ path: "$.outcome", message: "APPROVED_WITH_WARNINGS needs at least one finding" });
      break;
    case "NEEDS_CHANGES":
      if (!required.length) errors.push({ path: "$.outcome", message: "NEEDS_CHANGES needs at least one required finding" });
      break;
    case "BLOCKED":
      if (!report.blockedReason) errors.push({ path: "$.blockedReason", message: "BLOCKED needs a blockedReason" });
      break;
  }
  const { independent, implementedBy } = report.independence;
  if (independent && implementedBy.includes(report.reviewer)) {
    errors.push({ path: "$.independence", message: "reviewer is also an implementer; review is not independent" });
  }
  return errors;
}

/** Rules tying a worker report to the task it answers. */
export function checkWorkerReport(report, task) {
  const errors = schemas().validate(schemaId("worker-report"), report);
  if (errors.length) return errors;
  if (task && report.taskId !== task.id) {
    errors.push({ path: "$.taskId", message: `report is for ${report.taskId}, expected ${task.id}` });
  }
  if (report.status === "blocked" && !report.blockedReason) {
    errors.push({ path: "$.blockedReason", message: "blocked report needs a blockedReason" });
  }
  if (task) {
    const declared = new Set(report.scopeDeviations.map((d) => d.path));
    for (const f of report.filesChanged) {
      if (!matchesAny(f.path, task.scope.files) && !declared.has(f.path)) {
        errors.push({ path: "$.filesChanged", message: `${f.path} is outside task scope and not declared in scopeDeviations` });
      }
    }
  }
  return errors;
}
