import { test, beforeEach, afterEach, after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as I from "../plugins/factory/lib/installer.mjs";

const PLUGIN = new URL("../plugins/factory/", import.meta.url).pathname;
let repo, installed;
const w = (rel, text) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), text); };
const r = (rel) => readFileSync(join(repo, rel), "utf8");
const has = (rel) => existsSync(join(repo, rel));
const ALL = { components: ["config", "gitignore-block", "settings-permissions", "rules", "claude-md-block"], deny: true };
const install = (opts) => I.apply(repo, I.plan(repo, opts));

before(() => {
  installed = mkdtempSync(join(tmpdir(), "factory-install-plugin-"));
  cpSync(PLUGIN, join(installed, "factory"), { recursive: true });
});
after(() => rmSync(installed, { recursive: true, force: true }));
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "factory-install-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test("detects validation command candidates per ecosystem", () => {
  w("package.json", JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", "type-check": "tsc", build: "vite build" } }));
  w("pnpm-lock.yaml", "");
  assert.deepEqual(I.detectCommands(repo).commands, { test: "pnpm test", lint: "pnpm run lint", typecheck: "pnpm run type-check", build: "pnpm run build" });
  rmSync(join(repo, "package.json"));
  w("go.mod", "module x");
  assert.equal(I.detectCommands(repo).commands.test, "go test ./...");
  w("Makefile", "test:\n\tgo test ./...\nlint:\n\tgolangci-lint run\n");
  assert.equal(I.detectCommands(repo).commands.lint, "make lint", "an explicit Makefile target wins over ecosystem defaults");
});

test("inspect is read-only and reports the essentials", () => {
  w(".claude/settings.json", "{ not json");
  w(".claude/agents/backend-worker.md", "---\nname: backend-worker\n---\n");
  const before = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
  const info = I.inspect(repo);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }), before);
  assert.ok(info.settings.shared.error);
  assert.deepEqual(info.agentNameCollisions, ["backend-worker"]);
  assert.equal(info.factory.exists, false);
});

test("plan writes nothing; default components; apply writes, records and verifies", async () => {
  w("package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  const p = I.plan(repo, { commands: I.detectCommands(repo).commands });
  assert.deepEqual(p.actions.map((a) => a.component), I.DEFAULT_COMPONENTS);
  assert.ok(!has(".factory"));
  assert.match(p.hash, /^[a-f0-9]{12}$/);

  I.apply(repo, p);
  assert.deepEqual(JSON.parse(r(".factory/config.json")), { schemaVersion: 1, validation: { commands: { test: "npm test" } } });
  assert.match(r(".gitignore"), /# factory:begin v1\n\.factory\/workflows\/\n# factory:end\n/);
  const settings = JSON.parse(r(".claude/settings.local.json"));
  assert.deepEqual(settings.permissions.allow, I.ALLOW_RULES);
  assert.equal(settings.permissions.deny, undefined, "deny rules are opt-in");
  const receipt = JSON.parse(r(".factory/install.json"));
  assert.equal(receipt.kitVersion, I.kitVersion());
  assert.deepEqual(receipt.entries.map((e) => e.ownership), ["file", "block", "entries"]);
  const checks = await I.verify(repo);
  assert.ok(checks.every((c) => c.ok), JSON.stringify(checks));
});

test("existing user files are extended, never overwritten or reformatted beyond the edit", () => {
  w(".gitignore", "node_modules/\n.env");
  w("CLAUDE.md", "# My project\n\nHouse rules.\n");
  w(".claude/settings.json", '{\n    "model": "opus",\n    "permissions": { "allow": ["Bash(npm test)"], "deny": ["Edit(/.factory/**)"] }\n}\n');
  const p = I.plan(repo, { ...ALL, settings: "shared" });
  const s = p.actions.find((a) => a.component === "settings-permissions");
  assert.match(s.reason, /deny rules Edit\(\/\.factory\/\*\*\) still win/);
  I.apply(repo, p);
  assert.ok(r(".gitignore").startsWith("node_modules/\n.env\n\n# factory:begin v1\n"));
  assert.ok(r("CLAUDE.md").startsWith("# My project\n\nHouse rules.\n\n<!-- factory:begin v1 -->\n## AI Software Factory"));
  const settings = JSON.parse(r(".claude/settings.json"));
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.permissions.allow, ["Bash(npm test)", ...I.ALLOW_RULES]);
  assert.ok(r(".claude/settings.json").includes('\n    "model"'), "keeps the file's indentation");
  assert.ok(!has(".claude/settings.local.json"));
});

test("conflicts default to skip: unowned files, malformed settings, stray markers", () => {
  w(".factory/config.json", '{"schemaVersion":1}');
  w(".claude/settings.local.json", "{ broken");
  w("CLAUDE.md", "<!-- factory:begin v1 -->\nno end marker\n");
  const p = I.plan(repo, ALL);
  const by = Object.fromEntries(p.actions.map((a) => [a.component, a]));
  assert.equal(by.config.conflict, "exists-unowned");
  assert.equal(by["settings-permissions"].conflict, "malformed-settings");
  assert.equal(by["claude-md-block"].conflict, "malformed-block");
  assert.equal(by.rules.action, "create");
  I.apply(repo, p);
  assert.equal(r(".factory/config.json"), '{"schemaVersion":1}');
  assert.equal(r(".claude/settings.local.json"), "{ broken");
  assert.equal(JSON.parse(r(".factory/install.json")).entries.length, 2, "only rules + gitignore recorded");
});

test("re-running is idempotent; user edits are detected and preserved", () => {
  install(ALL);
  const again = I.plan(repo, ALL);
  assert.ok(again.actions.every((a) => a.action === "skip" && !a.conflict), JSON.stringify(again.actions));

  w(".claude/rules/factory-workflow.md", "my own version\n");
  w(".gitignore", r(".gitignore").replace(".factory/workflows/", ".factory/"));
  const st = Object.fromEntries(I.status(repo).entries.map((e) => [e.component, e.state]));
  assert.equal(st.rules, "modified");
  assert.equal(st["gitignore-block"], "modified");
  assert.equal(st.config, "intact");
  const p = I.plan(repo, ALL);
  const by = Object.fromEntries(p.actions.map((a) => [a.component, a]));
  assert.equal(by.rules.conflict, "user-modified");
  assert.equal(by["gitignore-block"].conflict, "user-modified");
});

test("update: an unmodified owned file is updated when the kit's content changes; missing files are re-created", () => {
  install({ components: ["config"], commands: { test: "npm test" } });
  const p = I.plan(repo, { components: ["config"], commands: { test: "npm test", lint: "npm run lint" } });
  assert.equal(p.actions[0].action, "update");
  I.apply(repo, p);
  assert.equal(JSON.parse(r(".factory/config.json")).validation.commands.lint, "npm run lint");
  assert.equal(I.status(repo).entries[0].state, "intact", "receipt hash refreshed");
  rmSync(join(repo, ".factory/config.json"));
  assert.match(I.plan(repo, { components: ["config"] }).actions[0].reason, /missing: re-create/);
});

test("plan hash changes when anything that would be written changes", () => {
  const a = I.plan(repo, ALL).hash;
  assert.equal(I.plan(repo, ALL).hash, a);
  assert.notEqual(I.plan(repo, { ...ALL, deny: false }).hash, a);
  w(".gitignore", "dist/\n");
  assert.notEqual(I.plan(repo, ALL).hash, a);
});

test("removal removes only intact Factory content and leaves workflows alone", () => {
  w(".gitignore", "node_modules/\n");
  w(".claude/settings.local.json", JSON.stringify({ permissions: { deny: ["Read(./.env)"] } }));
  install(ALL);
  mkdirSync(join(repo, ".factory/workflows/wf-20260101-x"), { recursive: true });
  w(".factory/config.json", '{"schemaVersion":1,"execution":{"maxConcurrentTasks":1}}\n');

  const p = I.removalPlan(repo);
  const by = Object.fromEntries(p.actions.map((a) => [a.component, a]));
  assert.equal(by.config.action, "skip");
  assert.equal(by["settings-permissions"].action, "remove-entries");
  I.applyRemoval(repo, p);

  assert.equal(r(".gitignore"), "node_modules/\n");
  assert.deepEqual(JSON.parse(r(".claude/settings.local.json")), { permissions: { deny: ["Read(./.env)"] } }, "pre-existing deny entry kept");
  assert.ok(!has(".claude/rules"), "empty rules dir removed");
  assert.ok(!has("CLAUDE.md"), "a file that only held the block is deleted");
  assert.ok(has(".factory/config.json"), "user-modified config kept");
  assert.ok(has(".factory/workflows/wf-20260101-x"));
  assert.deepEqual(JSON.parse(r(".factory/install.json")).entries.map((e) => e.component), ["config"]);
});

test("removal deletes a settings file the Factory created when nothing else is left", () => {
  install({ components: ["settings-permissions"] });
  I.applyRemoval(repo, I.removalPlan(repo));
  assert.ok(!has(".claude/settings.local.json"));
  assert.ok(!has(".factory/install.json"), "receipt removed once empty");
});

test("an invalid receipt is a clean rejection", () => {
  w(".factory/install.json", '{"schemaVersion":1}');
  assert.throws(() => I.plan(repo, ALL), I.InstallError);
  assert.throws(() => I.plan(repo, { components: ["nope"] }), /unknown component/);
});

test("factory-install CLI from an installed copy: plan, stale hash rejected, apply, status, remove", () => {
  const cli = join(installed, "factory", "bin", "factory-install");
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const run = (...args) => {
    const x = spawnSync(cli, [...args, "--root", repo], { encoding: "utf8", env });
    return { code: x.status, out: x.stdout, err: x.stderr };
  };
  assert.equal(run().code, 2);
  assert.equal(run("frobnicate").code, 2);
  assert.match(run("inspect").out, /Validation command candidates/);
  const plan = JSON.parse(run("plan", "--components", "config,rules", "--test", "npm test", "--json").out);
  assert.ok(!has(".factory"));
  assert.equal(run("apply", "--components", "config,rules").code, 2, "hash is mandatory");
  assert.equal(run("apply", "--components", "config,rules", "--plan-hash", plan.hash).code, 1, "different choices -> different plan");
  const ok = run("apply", "--components", "config,rules", "--test", "npm test", "--plan-hash", plan.hash);
  assert.equal(ok.code, 0, ok.out + ok.err);
  assert.match(ok.out, /ok {3}hooks probe/);
  assert.match(run("status").out, /rules · \.claude\/rules\/factory-workflow\.md · intact/);
  const rp = JSON.parse(run("remove", "--json").out);
  assert.equal(run("remove", "--apply", "--plan-hash", "000000000000").code, 1);
  assert.equal(run("remove", "--apply", "--plan-hash", rp.hash).code, 0);
  assert.ok(!has(".factory/config.json"));
});
