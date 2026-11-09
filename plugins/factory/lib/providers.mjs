// Detection of discovery and specification providers
// (docs/contracts/discovery-provider.md, specification-provider.md).
// Detection only reads files and runs read-only commands. It never installs
// or initialises anything.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const GRILL = "grill-with-docs";
const GRILL_DEPS = ["grilling", "domain-modeling"];
const GRILL_PLUGIN = "mattpocock-skills";

function skillAt(dir, name) {
  const path = join(dir, name, "SKILL.md");
  return existsSync(path) ? path : null;
}

/** Installed plugins via the supported CLI; null when it cannot be queried. */
export function installedPlugins({ runClaude = defaultRunClaude } = {}) {
  try {
    const out = runClaude(["plugin", "list", "--json"]);
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function defaultRunClaude(args) {
  return execFileSync("claude", args, { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Detect /grill-with-docs.
 * Returns { available, scope, invocation, path?, missingDependencies, note }.
 */
export function detectGrillWithDocs(root, { home = homedir(), plugins } = {}) {
  const scopes = [
    { scope: "project", dir: join(root, ".claude", "skills") },
    { scope: "user", dir: join(home, ".claude", "skills") },
  ];
  for (const { scope, dir } of scopes) {
    const path = skillAt(dir, GRILL);
    if (path) {
      const missingDependencies = GRILL_DEPS.filter((d) => !skillAt(dir, d));
      return {
        available: missingDependencies.length === 0,
        scope,
        invocation: `/${GRILL}`,
        path,
        missingDependencies,
        note: missingDependencies.length ? `found in ${scope} scope but its dependency skills are missing: ${missingDependencies.join(", ")}` : `found in ${scope} scope`,
      };
    }
  }
  const list = plugins === undefined ? installedPlugins() : plugins;
  if (list && JSON.stringify(list).includes(GRILL_PLUGIN)) {
    return {
      available: true,
      scope: "plugin",
      invocation: `/${GRILL_PLUGIN}:${GRILL}`,
      missingDependencies: [],
      note: `plugin ${GRILL_PLUGIN} is installed; whether it is enabled in this session is not verified`,
    };
  }
  return {
    available: false,
    scope: null,
    invocation: null,
    missingDependencies: [],
    note: list === null
      ? "not found in project or user skills; installed plugins could not be queried"
      : "not found in project skills, user skills or installed plugins",
    install: [`claude plugin install ${GRILL_PLUGIN}@claude-plugins-official`, "or: npx skills add mattpocock/skills (skills.sh)"],
  };
}

/**
 * Detect GitHub Spec Kit initialised for Claude in this repository.
 * Returns { available, version?, reason }.
 */
export function detectSpecKit(root) {
  const optionsPath = join(root, ".specify", "init-options.json");
  if (!existsSync(optionsPath)) return { available: false, reason: ".specify/init-options.json not found" };
  let options;
  try {
    options = JSON.parse(readFileSync(optionsPath, "utf8"));
  } catch {
    return { available: false, reason: ".specify/init-options.json is not valid JSON" };
  }
  const version = options.speckit_version;
  const major = Number(String(version ?? "").split(".")[0]);
  if (!version) return { available: false, reason: "speckit_version missing from init-options.json" };
  if (major !== 1) return { available: false, version, reason: `Spec Kit ${version} is not a supported major version (1.x verified)` };
  const skills = ["speckit-specify", "speckit-clarify", "speckit-plan"];
  const missing = skills.filter((s) => !skillAt(join(root, ".claude", "skills"), s));
  if (missing.length) return { available: false, version, reason: `Claude integration skills missing: ${missing.join(", ")}` };
  return { available: true, version, reason: `Spec Kit ${version} with Claude skills` };
}

/** Which spec provider to use given config and detection. */
export function selectSpecProvider(configured, detection) {
  if (configured === "local") return { provider: "local", note: "configured" };
  if (detection.available) return { provider: "spec-kit", note: detection.reason };
  if (configured === "spec-kit") return { provider: "local", note: `spec-kit requested but unavailable (${detection.reason}); falling back to local templates` };
  return { provider: "local", note: `auto: ${detection.reason}` };
}

/**
 * Evidence of discovery doc changes since baseRef: GLOSSARY*.md and docs/adr/**,
 * tracked changes plus untracked files.
 */
export function discoveryEvidence(root, baseRef) {
  const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const paths = [":(glob)**/GLOSSARY*.md", ":(glob)**/docs/adr/**"];
  let changed = [];
  try {
    const diffArgs = baseRef ? ["diff", "--name-status", baseRef, "--", ...paths] : ["diff", "--name-status", "--", ...paths];
    changed = run(diffArgs).trim().split("\n").filter(Boolean).map((l) => {
      const [status, ...rest] = l.split("\t");
      return { path: rest.at(-1), status };
    });
    const untracked = run(["ls-files", "--others", "--exclude-standard", "--", ...paths]).trim().split("\n").filter(Boolean);
    for (const p of untracked) changed.push({ path: p, status: "A" });
  } catch {
    return { changed: [], note: "git not available; evidence could not be collected" };
  }
  return { changed, note: changed.length ? `${changed.length} discovery doc change(s)` : "no GLOSSARY or ADR changes since the workflow base" };
}
