// Repository integration installer (docs/contracts/installation.md).
//
// inspect -> plan -> (user approves) -> apply, with a receipt in
// .factory/install.json so that updates and removal touch only what the
// Factory owns and the user has not modified. Planning is pure apart from
// reading files; `apply` and `applyRemoval` are the only writers, and they
// write one file at a time atomically.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { schemas, schemaId, resolveConfig, loadDefaults } from "./contracts.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RECEIPT = ".factory/install.json";
export const COMPONENTS = ["config", "gitignore-block", "settings-permissions", "rules", "claude-md-block"];
export const DEFAULT_COMPONENTS = ["config", "gitignore-block", "settings-permissions"];
export const ALLOW_RULES = ["Bash(factory-state *)", "Edit(/.factory/**)"];
export const DENY_RULES = ["Read(./.env)", "Read(./.env.*)", "Read(./**/*.pem)", "Read(./**/*.key)", "Read(./**/secrets/**)", "Bash(git push *)"];
const COMMAND_KINDS = ["format", "lint", "typecheck", "test", "build"];

const MD_BEGIN = "<!-- factory:begin v1 -->";
const MD_END = "<!-- factory:end -->";
const GI_BEGIN = "# factory:begin v1";
const GI_END = "# factory:end";

export class InstallError extends Error {}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const entriesHash = (entries) => sha256([...entries].sort().join("\n"));

export function kitVersion() {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version;
}

function read(root, rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function writeAtomic(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.factory-${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, p);
}

// ---------------------------------------------------------------------------
// Inspection (read-only)
// ---------------------------------------------------------------------------

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function packageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

/** Candidate validation commands. Proposals only: the user confirms them. */
export function detectCommands(root) {
  const found = {};
  const evidence = [];
  const set = (kind, cmd, why) => {
    if (!found[kind]) { found[kind] = cmd; evidence.push(`${kind}: ${cmd} (${why})`); }
  };
  const pkgText = read(root, "package.json");
  if (pkgText) {
    try {
      const scripts = JSON.parse(pkgText).scripts ?? {};
      const pm = packageManager(root);
      const run = (s) => (s === "test" ? `${pm} test` : `${pm} run ${s}`);
      const pick = (kind, names) => {
        const name = names.find((n) => scripts[n]);
        if (name) set(kind, run(name), `package.json script "${name}"`);
      };
      pick("test", ["test"]);
      pick("lint", ["lint"]);
      pick("typecheck", ["typecheck", "type-check", "tsc", "check-types"]);
      pick("build", ["build"]);
      pick("format", ["format", "fmt"]);
    } catch {
      evidence.push("package.json is not valid JSON; skipped");
    }
  }
  const make = read(root, "Makefile");
  if (make) {
    for (const [kind, names] of [["test", ["test"]], ["lint", ["lint"]], ["build", ["build"]], ["format", ["format", "fmt"]], ["typecheck", ["typecheck"]]]) {
      const name = names.find((n) => new RegExp(`^${n}\\s*:`, "m").test(make));
      if (name) set(kind, `make ${name}`, `Makefile target "${name}"`);
    }
  }
  const pyproject = read(root, "pyproject.toml");
  if (pyproject) {
    if (/\[tool\.pytest|pytest/.test(pyproject) || existsSync(join(root, "tests"))) set("test", "pytest", "pyproject.toml");
    if (/\[tool\.ruff/.test(pyproject)) { set("lint", "ruff check .", "[tool.ruff]"); set("format", "ruff format {file}", "[tool.ruff]"); }
    if (/\[tool\.mypy/.test(pyproject)) set("typecheck", "mypy .", "[tool.mypy]");
  }
  if (existsSync(join(root, "Cargo.toml"))) {
    set("test", "cargo test", "Cargo.toml"); set("lint", "cargo clippy", "Cargo.toml");
    set("build", "cargo build", "Cargo.toml"); set("format", "cargo fmt", "Cargo.toml");
  }
  if (existsSync(join(root, "go.mod"))) {
    set("test", "go test ./...", "go.mod"); set("lint", "go vet ./...", "go.mod");
    set("build", "go build ./...", "go.mod"); set("format", "gofmt -w {file}", "go.mod");
  }
  return { commands: found, evidence };
}

function listNames(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => (ext ? e.isFile() && e.name.endsWith(ext) : e.isDirectory()))
    .map((e) => (ext ? e.name.slice(0, -ext.length) : e.name));
}

function parseJsonFile(root, rel) {
  const text = read(root, rel);
  if (text === null) return { exists: false };
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { exists: true, error: "not a JSON object" };
    return { exists: true, value };
  } catch (e) {
    return { exists: true, error: e.message };
  }
}

export function loadReceipt(root) {
  const text = read(root, RECEIPT);
  if (text === null) return null;
  let receipt;
  try { receipt = JSON.parse(text); } catch (e) { throw new InstallError(`${RECEIPT} is not valid JSON: ${e.message}`); }
  const errors = schemas().validate(schemaId("install-receipt"), receipt);
  if (errors.length) throw new InstallError(`${RECEIPT} is invalid: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  return receipt;
}

export function inspect(root) {
  const defaults = loadDefaults();
  const roleAgents = Object.keys(defaults.roles);
  const repoAgents = listNames(join(root, ".claude", "agents"), ".md");
  const repoSkills = listNames(join(root, ".claude", "skills"));
  return {
    root,
    git: {
      repository: git(root, ["rev-parse", "--is-inside-work-tree"]) === "true",
      branch: git(root, ["symbolic-ref", "--short", "HEAD"]) ?? git(root, ["rev-parse", "--short", "HEAD"]),
      dirty: (git(root, ["status", "--porcelain"]) ?? "") !== "",
    },
    validation: detectCommands(root),
    claudeMd: existsSync(join(root, "CLAUDE.md")),
    rulesDir: existsSync(join(root, ".claude", "rules")),
    settings: {
      shared: parseJsonFile(root, ".claude/settings.json"),
      local: parseJsonFile(root, ".claude/settings.local.json"),
    },
    agentNameCollisions: repoAgents.filter((a) => roleAgents.includes(a)),
    repoSkills,
    specKit: existsSync(join(root, ".specify")),
    glossary: existsSync(join(root, "GLOSSARY.md")),
    adrs: existsSync(join(root, "docs", "adr")),
    factory: {
      exists: existsSync(join(root, ".factory")),
      config: existsSync(join(root, ".factory", "config.json")),
      workflows: listNames(join(root, ".factory", "workflows")).length,
      receipt: existsSync(join(root, RECEIPT)),
    },
    kitVersion: kitVersion(),
  };
}

// ---------------------------------------------------------------------------
// Desired content per component
// ---------------------------------------------------------------------------

export function configContent(commands = {}) {
  const config = { schemaVersion: 1 };
  const chosen = Object.fromEntries(COMMAND_KINDS.filter((k) => commands[k]).map((k) => [k, commands[k]]));
  if (Object.keys(chosen).length) config.validation = { commands: chosen };
  const { errors } = resolveConfig(config);
  if (errors.length) throw new InstallError(`generated config is invalid: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  return `${JSON.stringify(config, null, 2)}\n`;
}

const template = (name) => readFileSync(join(PLUGIN_ROOT, "core", "templates", name), "utf8");
export const rulesContent = () => template("rules-factory-workflow.md");
const claudeMdBody = () => template("claude-md-block.md").trimEnd();
const gitignoreBody = () => ".factory/workflows/";

/** Find a marked block. Returns { start, end, body } (end exclusive, after the end marker line) or null. */
export function findBlock(text, begin, end) {
  const s = text.indexOf(begin);
  if (s === -1) return null;
  const e = text.indexOf(end, s + begin.length);
  if (e === -1) return { malformed: true };
  const bodyStart = s + begin.length + 1;
  let stop = e + end.length;
  if (text[stop] === "\n") stop++;
  return { start: s, end: stop, body: text.slice(bodyStart, e).replace(/\n$/, "") };
}

function withBlock(text, begin, end, body) {
  const block = `${begin}\n${body}\n${end}\n`;
  const found = text ? findBlock(text, begin, end) : null;
  if (found && !found.malformed) return text.slice(0, found.start) + block + text.slice(found.end);
  if (!text) return block;
  return `${text}${text.endsWith("\n") ? "" : "\n"}\n${block}`;
}

function withoutBlock(text, begin, end) {
  const found = findBlock(text, begin, end);
  if (!found || found.malformed) return text;
  let before = text.slice(0, found.start);
  const after = text.slice(found.end);
  if (before.endsWith("\n\n")) before = before.slice(0, -1);
  return before + after;
}

const settingsPath = (target) => (target === "shared" ? ".claude/settings.json" : ".claude/settings.local.json");

function indentOf(text) {
  const m = text?.match(/\n([ \t]+)"/);
  return m ? m[1] : 2;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Build the change plan.
 * options: { components?, settings?: "local"|"shared", deny?: bool, commands?: {kind: cmd} }
 * Each action: { component, path, ownership, action, reason, preview, next?, entries?, blockBody?, conflict? }
 * action ∈ create | insert-block | update-block | add-entries | update | skip
 */
export function plan(root, options = {}) {
  const components = options.components ?? DEFAULT_COMPONENTS;
  for (const c of components) if (!COMPONENTS.includes(c)) throw new InstallError(`unknown component "${c}"; known: ${COMPONENTS.join(", ")}`);
  const receipt = loadReceipt(root);
  const owned = (path) => receipt?.entries.find((e) => e.path === path);
  const actions = [];

  const wholeFile = (component, path, content) => {
    const current = read(root, path);
    const entry = owned(path);
    if (current === null) {
      return actions.push({ component, path, ownership: "file", action: "create", reason: entry ? "recorded in the receipt but missing: re-create" : "new file", preview: content, next: content });
    }
    if (!entry) return actions.push({ component, path, ownership: "file", action: "skip", conflict: "exists-unowned", reason: "file exists and was not created by the Factory: left untouched", preview: "" });
    if (sha256(current) !== entry.sha256) return actions.push({ component, path, ownership: "file", action: "skip", conflict: "user-modified", reason: "edited since install: left untouched", preview: "" });
    if (current === content) return actions.push({ component, path, ownership: "file", action: "skip", reason: "up to date", preview: "" });
    return actions.push({ component, path, ownership: "file", action: "update", reason: "Factory-owned and unmodified; the kit template changed", preview: content, next: content });
  };

  const block = (component, path, begin, end, body) => {
    const current = read(root, path);
    const entry = owned(path);
    const found = current ? findBlock(current, begin, end) : null;
    if (found?.malformed) return actions.push({ component, path, ownership: "block", action: "skip", conflict: "malformed-block", reason: `found "${begin}" without "${end}"`, preview: "" });
    if (found && !entry) return actions.push({ component, path, ownership: "block", action: "skip", conflict: "exists-unowned", reason: "a Factory block exists but is not in the receipt", preview: "" });
    if (found && sha256(found.body) !== entry.sha256) return actions.push({ component, path, ownership: "block", action: "skip", conflict: "user-modified", reason: "block edited since install: left untouched", preview: "" });
    if (found && found.body === body) return actions.push({ component, path, ownership: "block", action: "skip", reason: "up to date", preview: "" });
    const preview = `${begin}\n${body}\n${end}`;
    return actions.push({ component, path, ownership: "block", action: found ? "update-block" : "insert-block", reason: found ? "the kit template changed" : current === null ? "new file with a marked block" : "append a marked block; the rest of the file is unchanged", preview, next: withBlock(current, begin, end, body), blockBody: body });
  };

  for (const component of components) {
    switch (component) {
      case "config": wholeFile(component, ".factory/config.json", configContent(options.commands)); break;
      case "rules": wholeFile(component, ".claude/rules/factory-workflow.md", rulesContent()); break;
      case "gitignore-block": block(component, ".gitignore", GI_BEGIN, GI_END, gitignoreBody()); break;
      case "claude-md-block": block(component, "CLAUDE.md", MD_BEGIN, MD_END, claudeMdBody()); break;
      case "settings-permissions": {
        const path = settingsPath(options.settings ?? "local");
        const parsed = parseJsonFile(root, path);
        if (parsed.error) { actions.push({ component, path, ownership: "entries", action: "skip", conflict: "malformed-settings", reason: `cannot parse: ${parsed.error}`, preview: "" }); break; }
        const settings = parsed.value ?? {};
        const perms = settings.permissions ?? {};
        if (typeof perms !== "object" || Array.isArray(perms)) { actions.push({ component, path, ownership: "entries", action: "skip", conflict: "malformed-settings", reason: "permissions is not an object", preview: "" }); break; }
        const want = { allow: ALLOW_RULES, deny: options.deny ? DENY_RULES : [] };
        const add = {};
        for (const key of ["allow", "deny"]) {
          const have = perms[key] ?? [];
          if (!Array.isArray(have)) { add.error = `permissions.${key} is not an array`; break; }
          add[key] = want[key].filter((r) => !have.includes(r));
        }
        if (add.error) { actions.push({ component, path, ownership: "entries", action: "skip", conflict: "malformed-settings", reason: add.error, preview: "" }); break; }
        const entries = [...add.allow.map((r) => `allow:${r}`), ...add.deny.map((r) => `deny:${r}`)];
        const conflictingDeny = (perms.deny ?? []).filter((r) => ALLOW_RULES.includes(r));
        if (!entries.length) { actions.push({ component, path, ownership: "entries", action: "skip", reason: "entries already present", preview: "" }); break; }
        const next = structuredClone(settings);
        next.permissions = { ...perms };
        for (const key of ["allow", "deny"]) if (add[key].length) next.permissions[key] = [...(perms[key] ?? []), ...add[key]];
        const preview = entries.map((e) => `+ permissions.${e.replace(":", ": ")}`).join("\n");
        actions.push({
          component, path, ownership: "entries", action: "add-entries", entries,
          reason: `${parsed.exists ? "add entries to the existing file; other keys unchanged" : "new settings file"}${conflictingDeny.length ? `; NOTE: your deny rules ${conflictingDeny.join(", ")} still win` : ""}`,
          preview, next: `${JSON.stringify(next, null, indentOf(read(root, path)))}\n`,
        });
        break;
      }
    }
  }
  return { kind: "install", root, kitVersion: kitVersion(), actions, hash: planHash(actions) };
}

/** Hash of what would be written, so apply can refuse a plan that changed since it was shown. */
export function planHash(actions) {
  return sha256(JSON.stringify(actions.map((a) => [a.component, a.path, a.action, a.next ?? null]))).slice(0, 12);
}

// ---------------------------------------------------------------------------
// Apply and receipt
// ---------------------------------------------------------------------------

export function apply(root, thePlan, { now = new Date().toISOString() } = {}) {
  const receipt = loadReceipt(root) ?? { schemaVersion: 1, kitVersion: thePlan.kitVersion, installedAt: now, updatedAt: now, entries: [] };
  const written = [];
  for (const a of thePlan.actions) {
    if (a.action === "skip") continue;
    writeAtomic(root, a.path, a.next);
    let entry;
    if (a.ownership === "file") entry = { path: a.path, component: a.component, ownership: "file", sha256: sha256(a.next) };
    else if (a.ownership === "block") entry = { path: a.path, component: a.component, ownership: "block", sha256: sha256(a.blockBody) };
    else {
      const prev = receipt.entries.find((e) => e.path === a.path && e.component === a.component);
      const added = [...new Set([...(prev?.addedEntries ?? []), ...a.entries])];
      entry = { path: a.path, component: a.component, ownership: "entries", sha256: entriesHash(added), addedEntries: added };
    }
    receipt.entries = receipt.entries.filter((e) => !(e.path === entry.path && e.component === entry.component));
    receipt.entries.push(entry);
    written.push(a.path);
  }
  receipt.kitVersion = thePlan.kitVersion;
  receipt.updatedAt = now;
  const errors = schemas().validate(schemaId("install-receipt"), receipt);
  if (errors.length) throw new InstallError(`receipt would be invalid: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  if (written.length) writeAtomic(root, RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  return { written, receipt };
}

/** Post-apply checks (installation.md §3 step 6). */
export async function verify(root) {
  const checks = [];
  const cfg = read(root, ".factory/config.json");
  if (cfg !== null) {
    try {
      const { errors } = resolveConfig(JSON.parse(cfg));
      checks.push({ check: "config", ok: !errors.length, detail: errors.map((e) => `${e.path} ${e.message}`).join("; ") || "valid" });
    } catch (e) {
      checks.push({ check: "config", ok: false, detail: e.message });
    }
  }
  for (const rel of [".claude/settings.json", ".claude/settings.local.json"]) {
    const p = parseJsonFile(root, rel);
    if (p.exists) checks.push({ check: rel, ok: !p.error, detail: p.error ?? "parses" });
  }
  const { handle } = await import("./hook-main.mjs");
  const probe = await handle("pre-tool-use", { cwd: root, tool_name: "Bash", tool_input: { command: "git status" } }, {});
  checks.push({ check: "hooks probe", ok: probe.exitCode === 0 && probe.stdout === "", detail: probe.stdout ? probe.stdout.trim() : "silent for a harmless command" });
  try {
    loadReceipt(root);
    checks.push({ check: "receipt", ok: existsSync(join(root, RECEIPT)), detail: existsSync(join(root, RECEIPT)) ? "valid" : "absent" });
  } catch (e) {
    checks.push({ check: "receipt", ok: false, detail: e.message });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Status and removal
// ---------------------------------------------------------------------------

/** Per receipt entry: intact | modified | missing. */
export function status(root) {
  const receipt = loadReceipt(root);
  if (!receipt) return { installed: false, entries: [] };
  const entries = receipt.entries.map((e) => ({ ...e, state: entryState(root, e) }));
  return { installed: true, kitVersion: receipt.kitVersion, currentKitVersion: kitVersion(), entries };
}

function entryState(root, e) {
  const text = read(root, e.path);
  if (text === null) return "missing";
  if (e.ownership === "file") return sha256(text) === e.sha256 ? "intact" : "modified";
  if (e.ownership === "block") {
    const [begin, end] = e.path === ".gitignore" ? [GI_BEGIN, GI_END] : [MD_BEGIN, MD_END];
    const found = findBlock(text, begin, end);
    if (!found) return "missing";
    if (found.malformed) return "modified";
    return sha256(found.body) === e.sha256 ? "intact" : "modified";
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return "modified"; }
  const present = (e.addedEntries ?? []).filter((x) => {
    const [key, ...rest] = x.split(":");
    return (parsed.permissions?.[key] ?? []).includes(rest.join(":"));
  });
  if (!present.length) return "missing";
  return present.length === e.addedEntries.length ? "intact" : "modified";
}

export function removalPlan(root) {
  const { installed, entries } = status(root);
  if (!installed) return { kind: "remove", actions: [], hash: planHash([]) };
  const actions = entries.map((e) => {
    const base = { component: e.component, path: e.path, ownership: e.ownership };
    if (e.state === "missing") return { ...base, action: "forget", reason: "already gone; drop from the receipt", preview: "" };
    if (e.state === "modified" && e.ownership !== "entries") return { ...base, action: "skip", conflict: "user-modified", reason: "edited since install: remove it by hand if you want it gone", preview: "" };
    const text = read(root, e.path);
    if (e.ownership === "file") return { ...base, action: "delete", reason: "created by the Factory and unmodified", preview: "", next: null };
    if (e.ownership === "block") {
      const [begin, end] = e.path === ".gitignore" ? [GI_BEGIN, GI_END] : [MD_BEGIN, MD_END];
      const next = withoutBlock(text, begin, end);
      return { ...base, action: next.trim() ? "remove-block" : "delete", reason: "remove the Factory block and its markers", preview: "", next: next.trim() ? next : null };
    }
    const settings = JSON.parse(text);
    const removed = [];
    for (const x of e.addedEntries ?? []) {
      const [key, ...rest] = x.split(":");
      const rule = rest.join(":");
      const arr = settings.permissions?.[key];
      if (Array.isArray(arr) && arr.includes(rule)) {
        settings.permissions[key] = arr.filter((r) => r !== rule);
        if (!settings.permissions[key].length) delete settings.permissions[key];
        removed.push(x);
      }
    }
    if (settings.permissions && !Object.keys(settings.permissions).length) delete settings.permissions;
    const empty = !Object.keys(settings).length;
    return { ...base, action: empty ? "delete" : "remove-entries", reason: `remove ${removed.join(", ")}`, preview: removed.map((x) => `- permissions.${x.replace(":", ": ")}`).join("\n"), next: empty ? null : `${JSON.stringify(settings, null, indentOf(text))}\n` };
  });
  return { kind: "remove", actions, hash: planHash(actions) };
}

export function applyRemoval(root, thePlan, { now = new Date().toISOString() } = {}) {
  const receipt = loadReceipt(root);
  if (!receipt) return { removed: [], kept: [] };
  const removed = [];
  const kept = [];
  for (const a of thePlan.actions) {
    if (a.action === "skip") { kept.push(a.path); continue; }
    if (a.action === "delete") {
      rmSync(join(root, a.path), { force: true });
      // Drop the directory too if the Factory's file was all it held (e.g. .claude/rules/).
      const dir = dirname(join(root, a.path));
      if (![root, join(root, ".claude"), join(root, ".factory")].includes(dir) && existsSync(dir) && !readdirSync(dir).length) rmdirSync(dir);
    }
    else if (a.action !== "forget") writeAtomic(root, a.path, a.next);
    removed.push(a.path);
    receipt.entries = receipt.entries.filter((e) => !(e.path === a.path && e.component === a.component));
  }
  if (receipt.entries.length) {
    receipt.updatedAt = now;
    writeAtomic(root, RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    rmSync(join(root, RECEIPT), { force: true });
  }
  return { removed, kept };
}
