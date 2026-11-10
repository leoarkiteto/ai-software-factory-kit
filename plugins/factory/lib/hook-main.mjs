// Dispatcher for plugin hooks. `handle` maps (event, stdin payload) to the
// hook's output and never throws: an internal error fails open with a
// visible systemMessage, because a broken guard must not wedge every
// session that has the plugin enabled.

import { findFactoryRoot, guardCommand, guardFile, preToolDeny, sessionNotice, relPath, isManifest, isFactoryConfig, toolPath, formatCommandFor, runFormat } from "./hooks.mjs";

const SILENT = { exitCode: 0, stdout: "" };
const json = (obj) => ({ exitCode: 0, stdout: `${JSON.stringify(obj)}\n` });

async function context(input, env) {
  const start = input.cwd || env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = findFactoryRoot(start) ?? (env.CLAUDE_PROJECT_DIR ? findFactoryRoot(env.CLAUDE_PROJECT_DIR) : null);
  if (!root) return null;
  // Loaded lazily so sessions without .factory/ pay only for the directory probe.
  const [{ loadConfig }, store, S] = await Promise.all([
    import("./contracts.mjs"), import("./store.mjs"), import("./state.mjs"),
  ]);
  const { config, errors: configErrors } = loadConfig(root);
  const { workflows, broken } = store.loadAll(root);
  const active = workflows.filter((m) => !S.TERMINAL.has(m.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { root, config, configErrors, active, broken, S };
}

export async function handle(event, input = {}, env = process.env) {
  try {
    const ctx = await context(input, env);
    if (!ctx) return SILENT;
    const { root, config, active, broken, S } = ctx;
    const toggles = config.hooks ?? {};
    const workflowActive = active.length > 0;

    switch (event) {
      case "session-start": {
        if (!toggles.sessionResume) return SILENT;
        const text = sessionNotice(active, broken, (m) => S.nextAction(m, config), S.summary);
        return text ? { exitCode: 0, stdout: `${text}\n` } : SILENT;
      }

      case "pre-tool-use": {
        if (!workflowActive) return SILENT;
        const tool = input.tool_name;
        let verdict = null;
        if (tool === "Bash") {
          if (toggles.commandGuard) verdict = guardCommand(input.tool_input?.command, config, { root });
        } else {
          verdict = guardFile(tool, input.tool_input, config, root, {
            pathGuard: Boolean(toggles.commandGuard),
            manifestGuard: Boolean(toggles.manifestValidation),
          });
        }
        return verdict ? json(preToolDeny(verdict.reason)) : SILENT;
      }

      case "post-tool-use": {
        const rel = relPath(root, toolPath(input.tool_input));
        if (!rel) return SILENT;
        // The Factory's own files are validated whenever .factory/ exists.
        if (toggles.manifestValidation && isFactoryConfig(rel)) {
          const errors = ctx.configErrors ?? [];
          if (errors.length) {
            return json({
              decision: "block",
              reason: `.factory/config.json is invalid, so the Factory falls back to defaults: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}. Fix the file, then check with factory-state config.`,
            });
          }
          return SILENT;
        }
        if (toggles.manifestValidation && isManifest(rel)) {
          const hit = broken.find((b) => rel.endsWith(`/${b.id}/manifest.json`));
          if (hit) {
            return json({
              decision: "block",
              reason: `${rel} is now invalid (${hit.message}${hit.errors.length ? `: ${hit.errors.slice(0, 5).map((e) => `${e.path} ${e.message}`).join("; ")}` : ""}). Manifests are written only by factory-state; restore it (git or the previous content) and redo the change with factory-state.`,
            });
          }
          return SILENT;
        }
        if (toggles.postEditFormat && workflowActive && !rel.startsWith(".factory/")) {
          const command = formatCommandFor(config.validation?.commands?.format, rel);
          if (!command) return SILENT;
          const r = runFormat(command, root);
          if (!r.ok) {
            return json({
              hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: `Factory post-edit format failed for ${rel} (${command}):\n${r.detail}`,
              },
            });
          }
        }
        return SILENT;
      }

      default:
        return SILENT;
    }
  } catch (e) {
    return json({ systemMessage: `AI Software Factory hook (${event}) failed and was skipped: ${e.message}` });
  }
}

export async function readStdin(stream = process.stdin) {
  if (stream.isTTY) return {};
  let data = "";
  for await (const chunk of stream) data += chunk;
  if (!data.trim()) return {};
  return JSON.parse(data);
}
