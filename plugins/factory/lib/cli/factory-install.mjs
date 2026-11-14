// factory-install: repository integration for /factory:init.
// Exit codes: 0 ok, 1 rejected (stale plan hash, conflicts, invalid receipt), 2 usage error.

import { resolve } from "node:path";
import { findRepoRoot } from "../store.mjs";
import * as I from "../installer.mjs";

const USAGE = `factory-install <command> [options] [--root DIR] [--json]

  inspect                       read-only survey of the repository
  plan   [choices]              show the change plan and its hash (writes nothing)
  apply  [choices] --plan-hash H  apply exactly the plan that 'plan' showed
  verify                        post-install checks (config, settings, hooks probe, receipt)
  status                        receipt entries: intact | modified | missing
  remove                        show the removal plan and its hash (writes nothing)
  remove --apply --plan-hash H  remove what the Factory owns and the user has not modified

Choices (same for plan and apply):
  --components a,b,...          ${I.COMPONENTS.join(", ")}
                                default: ${I.DEFAULT_COMPONENTS.join(", ")}
  --settings local|shared       .claude/settings.local.json (default) or .claude/settings.json
  --deny                        also add the optional deny rules
  --format|--lint|--typecheck|--test|--build CMD   validation command ("none" to leave unset)
  --no-detect                   do not pre-fill validation commands from the repository`;

const KINDS = ["format", "lint", "typecheck", "test", "build"];

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts._.push(a); continue; }
    const key = a.slice(2);
    if (["json", "deny", "no-detect", "apply"].includes(key)) { opts[key] = true; continue; }
    if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
    opts[key] = argv[++i];
  }
  return opts;
}

class UsageError extends Error {}

function choices(root, opts) {
  const components = opts.components ? opts.components.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (opts.settings && !["local", "shared"].includes(opts.settings)) throw new UsageError("--settings must be local or shared");
  const commands = opts["no-detect"] ? {} : { ...I.detectCommands(root).commands };
  for (const k of KINDS) {
    if (opts[k] === undefined) continue;
    if (opts[k] === "none") delete commands[k];
    else commands[k] = opts[k];
  }
  return { components, settings: opts.settings ?? "local", deny: Boolean(opts.deny), commands };
}

function renderPlan(p) {
  const lines = [`${p.kind === "remove" ? "Removal" : "Install"} plan (hash ${p.hash})`, ""];
  if (!p.actions.length) lines.push("Nothing to do.");
  for (const a of p.actions) {
    lines.push(`- ${a.component} · ${a.path} · ${a.action}${a.conflict ? ` [conflict: ${a.conflict}]` : ""} · ${a.reason}`);
    if (a.preview) lines.push(...a.preview.split("\n").map((l) => `    | ${l}`));
  }
  return lines.join("\n");
}

const strip = (p) => ({ ...p, actions: p.actions.map(({ next, blockBody, ...rest }) => rest) });

export async function run(argv) {
  let opts;
  try {
    opts = parse(argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${USAGE}\n`);
    return 2;
  }
  const [cmd] = opts._;
  const root = findRepoRoot(opts.root ? resolve(opts.root) : undefined);
  const out = (text, data) => process.stdout.write(`${opts.json ? JSON.stringify(data ?? text, null, 2) : text}\n`);
  try {
    switch (cmd) {
      case "inspect": {
        const r = I.inspect(root);
        const text = [
          `Repository: ${r.root}`,
          `Git: ${r.git.repository ? `branch ${r.git.branch}${r.git.dirty ? ", uncommitted changes" : ", clean"}` : "not a git repository"}`,
          `Validation command candidates: ${r.validation.evidence.length ? `\n  ${r.validation.evidence.join("\n  ")}` : "none detected"}`,
          `CLAUDE.md: ${r.claudeMd ? "present" : "absent"}; .claude/rules/: ${r.rulesDir ? "present" : "absent"}`,
          `Settings: shared ${describe(r.settings.shared)}; local ${describe(r.settings.local)}`,
          `Repo agents named like Factory roles: ${r.agentNameCollisions.join(", ") || "none"} (Factory agents are namespaced factory:*, so this is informational)`,
          `Spec Kit: ${r.specKit ? "present" : "absent"}; GLOSSARY.md: ${r.glossary ? "present" : "absent"}; docs/adr/: ${r.adrs ? "present" : "absent"}`,
          `Discovery format files (domain-modeling skill): ${r.discoverySkill.note}${r.discoverySkill.rule ? `; discovery-permissions would add ${r.discoverySkill.rule}` : ""}`,
          `.factory/: ${r.factory.exists ? `present (config ${r.factory.config ? "yes" : "no"}, ${r.factory.workflows} workflow(s), receipt ${r.factory.receipt ? "yes" : "no"})` : "absent"}`,
          `Kit version: ${r.kitVersion}`,
        ].join("\n");
        out(text, r);
        return 0;
      }
      case "plan": {
        const p = I.plan(root, choices(root, opts));
        out(renderPlan(p), strip(p));
        return 0;
      }
      case "apply": {
        if (!opts["plan-hash"]) throw new UsageError("apply needs --plan-hash from 'factory-install plan'");
        const p = I.plan(root, choices(root, opts));
        if (p.hash !== opts["plan-hash"]) {
          out(`Rejected: the plan changed since it was shown (now ${p.hash}). Show it again with 'factory-install plan' and get approval.`, { ok: false, hash: p.hash });
          return 1;
        }
        const { written } = I.apply(root, p);
        const checks = await I.verify(root);
        const skipped = p.actions.filter((a) => a.action === "skip");
        out([
          written.length ? `Written: ${written.join(", ")}` : "Nothing written.",
          ...skipped.map((a) => `Skipped: ${a.path} (${a.reason})`),
          "Checks:", ...checks.map((c) => `  ${c.ok ? "ok  " : "FAIL"} ${c.check}: ${c.detail}`),
          "Undo with: factory-install remove (shows a plan first).",
        ].join("\n"), { ok: checks.every((c) => c.ok), written, skipped: strip({ actions: skipped }).actions, checks });
        return checks.every((c) => c.ok) ? 0 : 1;
      }
      case "verify": {
        const checks = await I.verify(root);
        out(checks.map((c) => `${c.ok ? "ok  " : "FAIL"} ${c.check}: ${c.detail}`).join("\n"), checks);
        return checks.every((c) => c.ok) ? 0 : 1;
      }
      case "status": {
        const s = I.status(root);
        out(s.installed
          ? [`Installed with kit ${s.kitVersion} (plugin now ${s.currentKitVersion})`, ...s.entries.map((e) => `- ${e.component} · ${e.path} · ${e.state}`)].join("\n")
          : "No receipt: the repository integration is not installed.", s);
        return 0;
      }
      case "remove": {
        const p = I.removalPlan(root);
        if (!opts.apply) { out(renderPlan(p), strip(p)); return 0; }
        if (p.hash !== opts["plan-hash"]) {
          out(`Rejected: the removal plan changed since it was shown (now ${p.hash}).`, { ok: false, hash: p.hash });
          return 1;
        }
        const r = I.applyRemoval(root, p);
        out([`Removed or updated: ${r.removed.join(", ") || "nothing"}`, ...(r.kept.length ? [`Kept (modified by you): ${r.kept.join(", ")}`] : []), ".factory/workflows/ was left untouched."].join("\n"), r);
        return 0;
      }
      case undefined:
      case "help":
        process.stdout.write(`${USAGE}\n`);
        return cmd ? 0 : 2;
      default:
        throw new UsageError(`unknown command "${cmd}"`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n\n${USAGE}\n`);
      return 2;
    }
    if (e instanceof I.InstallError) {
      out(`Rejected: ${e.message}`, { ok: false, error: e.message });
      return 1;
    }
    throw e;
  }
}

function describe(s) {
  if (!s.exists) return "absent";
  return s.error ? `INVALID (${s.error})` : "present";
}
