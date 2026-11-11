// Plugin hook logic (hooks/hooks.json -> hooks/factory-hook.mjs).
//
// Plugin hooks fire in every session that has the plugin enabled, so every
// handler is inert unless the repository has a `.factory/` directory, and
// the guards act only while a Factory workflow is active. The guards are a
// best-effort safety net for workflow sessions. They are not a sandbox: the
// security boundary is Claude Code's permission system (deny rules).
//
// All functions here are pure apart from `findFactoryRoot` and `runFormat`,
// so they can be tested with synthetic hook payloads.

import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import { matchesAny } from "./glob.mjs";

/** Nearest ancestor of `start` that contains a `.factory/` directory, else null. */
export function findFactoryRoot(start) {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, ".factory");
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Repo-relative POSIX path, or null when the path is outside the repo. */
export function relPath(root, path) {
  if (!path) return null;
  const rel = relative(root, resolve(root, path));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

// Agent worktrees live inside the repo; protected-path and manifest checks
// apply to the path as seen from the worktree's own root.
const WORKTREE_PREFIX = /^\.claude\/worktrees\/[^/]+\//;
const stripWorktree = (rel) => rel.replace(WORKTREE_PREFIX, "");

// Template files that conventionally hold no secrets.
const SECRET_TEMPLATES = /(^|\/)\.env\.(example|sample|template|dist|defaults)$/;

export function isProtected(rel, config) {
  const p = stripWorktree(rel);
  if (SECRET_TEMPLATES.test(p)) return false;
  return matchesAny(p, config.security?.protectedPaths ?? []);
}

const MANIFEST = /^\.factory\/workflows\/[^/]+\/manifest\.json$/;
export const isManifest = (rel) => MANIFEST.test(stripWorktree(rel));
export const isFactoryConfig = (rel) => stripWorktree(rel) === ".factory/config.json";

// ---------------------------------------------------------------------------
// Command guard
// ---------------------------------------------------------------------------

/**
 * Split a shell command into simple-command segments. This is a heuristic
 * tokenizer, not a shell parser: it splits on control operators outside
 * quotes and recurses into `sh -c '...'` / `bash -c` / `eval` strings and
 * `$(...)` / backtick substitutions.
 */
export function segments(command, depth = 0) {
  const out = [];
  let cur = "";
  let quote = null;
  // Here-documents: the body is data for the command that owns it, not
  // commands. Bodies are collected here and analysed only when something in
  // the command would execute them (see the end of this function).
  const heredocs = [];
  let segDocs = []; // opened in the current segment
  let lineDocs = []; // opened on the current line, body not read yet
  const push = () => {
    const s = cur.trim();
    if (s) out.push(s);
    lineDocs.push(...segDocs);
    segDocs = [];
    cur = "";
  };
  /** Read the bodies of the heredocs opened on the line that ended before `pos`. */
  const readBodies = (pos) => {
    for (const h of lineDocs) {
      for (;;) {
        if (pos >= command.length) break;
        const nl = command.indexOf("\n", pos);
        const line = command.slice(pos, nl === -1 ? command.length : nl);
        pos = nl === -1 ? command.length : nl + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        h.body += `${line}\n`;
      }
      heredocs.push(h);
    }
    lineDocs = [];
    return pos;
  };
  const subs = [];
  let arith = 0; // inside (( … )), where << is a shift, not a heredoc
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const two = command.slice(i, i + 2);
    if (quote) {
      if (c === "\\" && quote === '"') { cur += c + (command[i + 1] ?? ""); i++; continue; }
      if (c === quote) quote = null;
      if (quote === '"' && two === "$(") {
        const end = matchParen(command, i + 1);
        subs.push(command.slice(i + 2, end));
      }
      cur += c;
      continue;
    }
    if (c === "\\") { cur += c + (command[i + 1] ?? ""); i++; continue; }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (two === "((") { arith++; push(); i++; continue; }
    if (two === "))" && arith > 0) { arith--; push(); i++; continue; }
    if (two === "<<" && command[i + 2] !== "<" && arith === 0) {
      // A bare delimiter starts with a letter or "_", so `x <<2` is not taken as one.
      const m = command.slice(i).match(/^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([A-Za-z_][^\s;&|()<>'"]*))/);
      if (m) {
        segDocs.push({ strip: m[1] === "-", delim: m[2] ?? m[3] ?? m[4], body: "" });
        cur += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === "\n") {
      push();
      if (lineDocs.length) i = readBodies(i + 1) - 1;
      continue;
    }
    if (two === "$(") {
      const end = matchParen(command, i + 1);
      subs.push(command.slice(i + 2, end));
      cur += " ";
      i = end;
      continue;
    }
    if (c === "`") {
      const end = command.indexOf("`", i + 1);
      const stop = end === -1 ? command.length : end;
      subs.push(command.slice(i + 1, stop));
      i = stop;
      continue;
    }
    if (two === "&&" || two === "||" || two === "|&") { push(); i++; continue; }
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") { push(); continue; }
    cur += c;
  }
  push();
  if (depth < 3) {
    for (const s of subs) out.push(...segments(s, depth + 1));
    for (const s of [...out]) {
      const inner = innerScript(s);
      if (inner !== null) out.push(...segments(inner, depth + 1));
    }
    // A heredoc body is executed when it reaches a shell, directly
    // (`bash <<EOF`) or through a pipe (`cat <<EOF | sh`). Conservatively,
    // analyse every body when any segment of the command runs a shell.
    if (heredocs.length && out.some(runsShell)) {
      for (const h of heredocs) out.push(...segments(h.body, depth + 1));
    }
  }
  return out;
}

const basename = (w) => w.replace(/\/+$/, "").split("/").pop();
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "ssh", "source", ".", "eval"]);
const runsShell = (seg) => words(normalise(seg)).some((w) => SHELLS.has(basename(w)));

// Destructive SQL is data until it reaches a database client, so it is
// checked over the whole command (heredoc bodies and pipes included) and
// denied only when some segment invokes a client.
const DESTRUCTIVE_SQL = /\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE)|TRUNCATE\s+(?:TABLE\s+)?\w)/i;
const SQL_CLIENTS = new Set([
  "psql", "pgcli", "mysql", "mariadb", "mycli", "sqlite3", "sqlite", "litecli", "duckdb", "sqlcmd", "sqlplus",
  "clickhouse", "clickhouse-client", "cockroach", "usql", "snowsql", "bq", "cqlsh", "turso",
]);
const invokesSqlClient = (seg) => words(normalise(seg)).some((w) => SQL_CLIENTS.has(basename(w)));

function matchParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return s.length;
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
  return t;
}

/** The script passed to `sh -c`, `bash -c`, `zsh -c` or `eval`, if any. */
function innerScript(segment) {
  const s = normalise(segment);
  const m = s.match(/^(?:(?:\/usr)?\/bin\/)?(?:ba|z|da|k)?sh\s+(?:-[a-z]*\s+)*-[a-z]*c\s+([\s\S]+)$/) ?? s.match(/^eval\s+([\s\S]+)$/);
  return m ? unquote(m[1]) : null;
}

/** Drop leading env assignments and transparent wrappers (env, command, nohup, time, sudo -flags). */
export function normalise(segment) {
  let s = segment.trim();
  for (;;) {
    const before = s;
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+/, "");
    s = s.replace(/^(?:env|command|nohup|time|exec|builtin)\s+/, "");
    if (s === before) return s;
  }
}

/** Unquoted word tokens of a segment (best effort). */
export function words(segment) {
  return (segment.match(/'[^']*'|"(?:\\.|[^"])*"|\S+/g) ?? []).map(unquote);
}

// Each rule: [id, regex over a normalised segment, reason]. Regexes are
// anchored at the start of the segment so text inside quoted arguments
// (commit messages, echo) does not trigger them.
const GIT = String.raw`git(?:\s+(?:-C\s+\S+|-c\s+\S+|--[a-z-]+(?:=\S+)?))*\s+`;
const RULES = [
  ["sudo", /^sudo\b/, "privilege escalation (sudo)"],
  ["git-push", new RegExp(`^${GIT}push\\b`), "git push publishes commits"],
  ["git-reset-hard", new RegExp(`^${GIT}reset\\b.*--hard\\b`), "git reset --hard discards uncommitted work"],
  ["git-clean", new RegExp(`^${GIT}clean\\b.*\\s-[a-zA-Z]*[fdxX]`), "git clean deletes untracked files"],
  ["git-checkout-discard", new RegExp(`^${GIT}checkout\\b(?:.*\\s)?(?:--\\s+)?\\.(?:\\s|$)`), "git checkout . discards uncommitted changes"],
  ["git-restore-discard", new RegExp(`^${GIT}restore\\b(?!.*--staged\\b(?!.*--worktree)).*\\s\\.(?:\\s|$)`), "git restore . discards uncommitted changes"],
  ["git-branch-delete", new RegExp(`^${GIT}branch\\b.*\\s(?:-D|--delete\\s+--force|-d\\s+-f)\\b`), "force-deleting a branch"],
  ["git-stash-destroy", new RegExp(`^${GIT}stash\\s+(?:drop|clear)\\b`), "dropping stashed work"],
  ["git-filter", new RegExp(`^${GIT}(?:filter-branch|filter-repo|update-ref\\s+-d|reflog\\s+expire)\\b`), "history rewriting"],
  ["publish", /^(?:npm|yarn|pnpm|bun)\s+(?:.*\s)?publish\b|^(?:cargo|poetry|gem|twine|dotnet\s+nuget)\s+(?:publish|push|upload)\b|^gem\s+push\b|^mvn\s+.*\bdeploy\b|^gradle\w*\s+.*\bpublish/, "publishing a package"],
  ["container-push", /^(?:docker|podman|buildah)\s+(?:image\s+)?push\b/, "pushing a container image"],
  ["kubectl", /^kubectl\s+(?:.*\s)?(?:apply|create|delete|replace|patch|edit|scale|rollout|drain|cordon|set)\b/, "changing a Kubernetes cluster"],
  ["helm", /^helm\s+(?:.*\s)?(?:install|upgrade|uninstall|delete|rollback)\b/, "changing a Helm release"],
  ["terraform", /^(?:terraform|tofu|terragrunt)\s+(?:.*\s)?(?:apply|destroy|import|state\s+(?:rm|mv|push))\b/, "changing infrastructure"],
  ["pulumi", /^pulumi\s+(?:.*\s)?(?:up|destroy|update|refresh)\b/, "changing infrastructure"],
  ["cloud-deploy", /^(?:vercel|netlify|firebase|flyctl|fly|serverless|sls|cdk|wrangler|railway|amplify|eb|surge)\s+(?:.*\s)?(?:deploy|publish|up|destroy)\b|^vercel\b.*\s--prod\b|^heroku\s+/, "deploying"],
  ["gcloud", /^gcloud\s+(?:.*\s)?(?:deploy|delete|create|update)\b/, "changing cloud resources"],
  ["aws", /^aws\s+(?:\S+\s+)(?:delete|terminate|remove|put|create|update|deploy|rb|rm)\S*\b|^aws\s+s3\s+(?:rm|rb|sync|mv|cp)\b/, "changing AWS resources"],
  ["az", /^az\s+(?:.*\s)?(?:delete|create|deploy|update)\b/, "changing Azure resources"],
  ["database", /^(?:dropdb|dropuser)\b/, "destructive database command"],
  ["disk", /^(?:mkfs(?:\.\w+)?|fdisk|diskutil\s+(?:erase|partition)|shred)\b|^dd\b.*\bof=\/dev\//, "disk-level destructive operation"],
  ["chmod-world", /^chmod\s+(?:-R\s+)?(?:0?777|a\+rwx)\b/, "world-writable permissions"],
];

function rmDanger(ws) {
  if (ws[0] !== "rm") return null;
  const flags = ws.slice(1).filter((w) => w.startsWith("-")).join("");
  const recursive = /r|R|--recursive/.test(flags);
  const targets = ws.slice(1).filter((w) => !w.startsWith("-"));
  for (const t of targets) {
    const n = t.replace(/\/+$/, "") || "/";
    if (["/", "~", "$HOME", "${HOME}", "..", ".", "*", "./*", "/*", "~/*"].includes(n) || /^\/[^/]+$/.test(n) && recursive) {
      return `rm on ${t}`;
    }
    if (/(^|\/)\.git(\/|$)/.test(n)) return `rm on ${t} (repository metadata)`;
    if (/(^|\/)\.factory(\/|$)/.test(n)) return `rm on ${t} (Factory workflow state)`;
  }
  return null;
}

const WRITE_VERBS = /^(?:tee|mv|cp|rm|truncate|install|ln|sed\s+(?:.*\s)?-i|perl\s+(?:.*\s)?-[a-z]*i|python3?|node|jq)\b/;

/**
 * Decide whether a Bash command may run during a workflow.
 * Returns null (no objection) or { decision: "deny", rule, reason }.
 */
export function guardCommand(command, config, { root } = {}) {
  if (typeof command !== "string" || !command.trim()) return null;
  const security = config.security ?? {};
  const deny = (rule, reason) => ({ decision: "deny", rule, reason });
  // Pipelines are split into segments below, so check this one on the whole command.
  if (/(?:^|[;&|(\s])(?:curl|wget)\b[^;&]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/.test(command)) {
    return deny("remote-script", "piping a downloaded script into a shell");
  }
  const segs = segments(command);
  if (DESTRUCTIVE_SQL.test(command) && segs.some(invokesSqlClient)) {
    return deny("database", "destructive database statement sent to a database client");
  }
  for (const raw of segs) {
    const seg = normalise(raw);
    const ws = words(seg);
    // factory-state is the sanctioned writer of workflow state.
    if (ws[0] === "factory-state") continue;
    for (const [id, re, why] of RULES) {
      if (id === "git-push" && security.allowGitPush) {
        if (/\s(?:-f|--force(?:-with-lease)?|--mirror|--delete)\b|\s\+\S/.test(seg)) return deny("git-force-push", "force push, mirror or remote branch deletion");
        continue;
      }
      if (re.test(seg)) return deny(id, why);
    }
    const rm = rmDanger(ws);
    if (rm) return deny("rm", rm);
    // Shell redirections and in-place writers aimed at manifests or protected files.
    const redirects = [...seg.matchAll(/(?:^|[^0-9&<>])>{1,2}\s*([^\s;&|]+)/g)].map((m) => unquote(m[1]));
    const writes = WRITE_VERBS.test(seg);
    for (const target of [...redirects, ...(writes ? ws.slice(1) : [])]) {
      const rel = root ? relPath(root, target) : target.replace(/^\.\//, "");
      if (rel && isManifest(rel)) return deny("manifest-write", `writing ${rel} directly; workflow state changes go through factory-state`);
    }
    if (root) {
      for (const w of ws.slice(1)) {
        if (w.startsWith("-") || !/[./]/.test(w)) continue;
        const rel = relPath(root, w);
        if (rel && isProtected(rel, config)) return deny("protected-path", `${rel} matches security.protectedPaths`);
      }
    }
    for (const pattern of security.blockedCommands ?? []) {
      let re;
      try { re = new RegExp(pattern); } catch { continue; }
      if (re.test(seg)) return deny("blocked-command", `matches security.blockedCommands /${pattern}/`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// File tool guard
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const FILE_TOOLS = new Set([...WRITE_TOOLS, "Read"]);

export function toolPath(toolInput) {
  return toolInput?.file_path ?? toolInput?.notebook_path ?? toolInput?.path ?? null;
}

/**
 * Decide whether a file tool call may run during a workflow.
 * Protected paths are denied for reads and writes; manifests for writes.
 */
export function guardFile(toolName, toolInput, config, root, { manifestGuard = true, pathGuard = true } = {}) {
  if (!FILE_TOOLS.has(toolName)) return null;
  const rel = relPath(root, toolPath(toolInput));
  if (!rel) return null;
  if (pathGuard && isProtected(rel, config)) {
    return { decision: "deny", rule: "protected-path", reason: `${rel} matches security.protectedPaths; ask the user if access is really needed` };
  }
  if (manifestGuard && WRITE_TOOLS.has(toolName) && isManifest(rel)) {
    return { decision: "deny", rule: "manifest-write", reason: `${rel} is written only by factory-state; use the factory-state command for this change` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Output builders (Claude Code hook JSON)
// ---------------------------------------------------------------------------

export function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Factory guard: ${reason}. This is blocked while a Factory workflow is active. If it is genuinely required, stop and ask the user; they can run it themselves.`,
    },
  };
}

export function sessionNotice(active, broken, nextActionOf, summaryOf) {
  if (!active.length && !broken.length) return null;
  const lines = ["AI Software Factory: workflow state found in .factory/."];
  for (const m of active.slice(0, 5)) {
    const n = nextActionOf(m);
    lines.push(`- ${summaryOf(m)} | next: ${n.action}`);
  }
  if (active.length > 5) lines.push(`- … and ${active.length - 5} more (factory-state list)`);
  for (const b of broken) lines.push(`- ${b.id}: manifest invalid (${b.message}); run factory-state validate ${b.id}`);
  lines.push("Do not resume automatically. If the user wants to continue, they run /factory:resume [ID].");
  return lines.join("\n");
}

/** Shell-quote a path for the {file} placeholder. */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function formatCommandFor(template, file) {
  if (!template) return null;
  return template.includes("{file}") ? template.replaceAll("{file}", shq(file)) : template;
}

export function runFormat(command, cwd, timeoutMs = 60000) {
  try {
    execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, encoding: "utf8" });
    return { ok: true };
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || "").toString().trim().split("\n").slice(-5).join("\n");
    return { ok: false, detail };
  }
}
