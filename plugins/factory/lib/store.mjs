// File-system persistence for workflows under <repo>/.factory/workflows/.
// Every write validates first and is atomic (temp file + rename).

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { validateManifest, StateError, TERMINAL } from "./state.mjs";

export const FACTORY_DIR = ".factory";

/** Repository root: explicit, $CLAUDE_PROJECT_DIR, git toplevel, or cwd. */
export function findRepoRoot(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.CLAUDE_PROJECT_DIR) return resolve(process.env.CLAUDE_PROJECT_DIR);
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.cwd();
  }
}

export const workflowsDir = (root) => join(root, FACTORY_DIR, "workflows");
export const workflowDir = (root, id) => join(workflowsDir(root), id);
export const manifestPath = (root, id) => join(workflowDir(root, id), "manifest.json");

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listWorkflowIds(root) {
  const dir = workflowsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
}

export function loadManifest(root, id) {
  const path = manifestPath(root, id);
  if (!existsSync(path)) throw new StateError(`workflow ${id} not found`);
  let m;
  try {
    m = readJson(path);
  } catch (e) {
    throw new StateError(`workflow ${id}: manifest is not valid JSON (${e.message})`);
  }
  const errors = validateManifest(m);
  if (errors.length) throw new StateError(`workflow ${id}: manifest invalid`, errors);
  return m;
}

export function saveManifest(root, m) {
  const errors = validateManifest(m);
  if (errors.length) throw new StateError(`refusing to save invalid manifest ${m.id}`, errors);
  writeJsonAtomic(manifestPath(root, m.id), m);
  return m;
}

/** Load every workflow, collecting (not throwing on) broken ones. */
export function loadAll(root) {
  const workflows = [];
  const broken = [];
  for (const id of listWorkflowIds(root)) {
    try {
      workflows.push(loadManifest(root, id));
    } catch (e) {
      broken.push({ id, message: e.message, errors: e.errors ?? [] });
    }
  }
  return { workflows, broken };
}

/** Non-terminal workflows, most recently updated first. */
export function activeWorkflows(root) {
  return loadAll(root).workflows
    .filter((m) => !TERMINAL.has(m.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Resolve a repo-relative artifact path and make sure it stays inside the repo.
 * Returns the POSIX relative path.
 */
export function repoRelative(root, path) {
  const abs = resolve(root, path);
  const rel = relative(root, abs);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new StateError(`path ${path} is outside the repository`);
  }
  return rel.split(sep).join("/");
}
