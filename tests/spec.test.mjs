import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLocalSpec, checkSpecKitSpec, checkDiscoverySummary, normId } from "../plugins/factory/lib/spec.mjs";
import { detectGrillWithDocs, detectSpecKit, selectSpecProvider } from "../plugins/factory/lib/providers.mjs";

const fx = (f) => readFileSync(new URL(`./fixtures/spec/${f}`, import.meta.url), "utf8");
const local = fx("local-complete.md");
const errs = (r) => r.errors.join("\n");

test("complete local spec passes and lists IDs", () => {
  const r = checkLocalSpec(local);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.ids, { FR: ["FR-1", "FR-2"], NFR: ["NFR-1"], AC: ["AC-1", "AC-2"], SC: [] });
});

test("local spec failures are specific", () => {
  assert.match(errs(checkLocalSpec(local.replace(/## Edge cases[\s\S]*?## Constraints/, "## Constraints"))), /missing section "## edge cases"/);
  assert.match(errs(checkLocalSpec(local.replace("- **AC-2** (FR-2, NFR-1)", "- **AC-2** (NFR-1)"))), /FR-2 is not covered/);
  assert.match(errs(checkLocalSpec(local.replace("(FR-1):", "(FR-9):"))), /AC-1 references unknown FR-9/);
  assert.match(errs(checkLocalSpec(local.replace("(FR-1):", ":"))), /AC-1 references no requirement/);
  assert.match(errs(checkLocalSpec(local.replace("- **FR-2:**", "- **FR-1:**"))), /duplicate ID FR-1/);
  assert.match(errs(checkLocalSpec(local.replace("(non-blocking) ", ""))), /not marked non-blocking/);
  assert.match(errs(checkLocalSpec(local.replace("### Out of scope", "### Later"))), /Out of scope/);
  assert.match(errs(checkLocalSpec(`${local}\nFR-3 [NEEDS CLARIFICATION: x]`)), /NEEDS CLARIFICATION/);
  assert.match(errs(checkLocalSpec(local.replace("- **NFR-1:** Refund request completes in under 2 s at p95.", "TBD"))), /None identified/);
  assert.deepEqual(checkLocalSpec(local.replace("- **NFR-1:** Refund request completes in under 2 s at p95.", "None identified.").replace(", NFR-1", "")).errors, []);
  assert.deepEqual(checkLocalSpec(local.replace("- (non-blocking) Should refunds email the customer? Default: no.", "- None")).errors, []);
});

test("Spec Kit spec + Factory supplements pass; gaps are reported", () => {
  const spec = fx("speckit-spec.md");
  const plan = fx("speckit-plan.md");
  const r = checkSpecKitSpec(spec, plan);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.ids.FR, ["FR-001", "FR-002"]);
  assert.deepEqual(r.ids.SC, ["SC-001"]);
  assert.match(errs(checkSpecKitSpec(spec, "")), /missing "## Spec supplements"/);
  assert.match(errs(checkSpecKitSpec(spec.replace("FR-002**: System", "FR-002**: [NEEDS CLARIFICATION: x] System"), plan)), /speckit-clarify/);
  assert.match(errs(checkSpecKitSpec(spec, plan.replace("| FR-002, NFR-1 |", "| NFR-1 |"))), /FR-002 is not covered/);
  assert.equal(normId("FR-001"), "FR-1");
});

test("discovery summary requires sections and no blocking questions", () => {
  const ok = ["Provider", "Decisions", "Vocabulary", "Behaviour", "Constraints and assumptions", "Scope", "Non-blocking open questions", "Blocking open questions", "Docs changed"]
    .map((h) => `## ${h}\n${h === "Blocking open questions" ? "None" : h === "Provider" ? "grill-with-docs; GLOSSARY.md changed" : "- x"}\n`).join("\n");
  assert.deepEqual(checkDiscoverySummary(ok).errors, []);
  assert.match(checkDiscoverySummary(ok.replace("## Blocking open questions\nNone", "## Blocking open questions\n- Who approves refunds?")).errors.join(), /blocking open questions remain/);
  assert.match(checkDiscoverySummary(ok.replace("## Vocabulary", "## Words")).errors.join(), /missing section "## vocabulary"/);
});

test("grill-with-docs detection: project, user, partial install, plugin, absent", () => {
  const base = mkdtempSync(join(tmpdir(), "factory-prov-"));
  const root = join(base, "repo"), home = join(base, "home");
  const skill = (dir, name) => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, "SKILL.md"), "---\nname: x\n---\n"); };
  try {
    mkdirSync(root, { recursive: true });
    let d = detectGrillWithDocs(root, { home, plugins: [] });
    assert.equal(d.available, false);
    assert.ok(d.install.length);
    assert.equal(detectGrillWithDocs(root, { home, plugins: null }).note.includes("could not be queried"), true);
    skill(join(home, ".claude/skills"), "grill-with-docs");
    d = detectGrillWithDocs(root, { home, plugins: [] });
    assert.equal(d.available, false, "dependencies missing");
    assert.deepEqual(d.missingDependencies, ["grilling", "domain-modeling"]);
    skill(join(home, ".claude/skills"), "grilling");
    skill(join(home, ".claude/skills"), "domain-modeling");
    d = detectGrillWithDocs(root, { home, plugins: [] });
    assert.deepEqual([d.available, d.scope, d.invocation], [true, "user", "/grill-with-docs"]);
    for (const s of ["grill-with-docs", "grilling", "domain-modeling"]) skill(join(root, ".claude/skills"), s);
    assert.equal(detectGrillWithDocs(root, { home, plugins: [] }).scope, "project", "project scope checked first");
    const bare = join(base, "bare");
    mkdirSync(bare);
    d = detectGrillWithDocs(bare, { home: join(base, "nohome"), plugins: [{ id: "mattpocock-skills@claude-plugins-official" }] });
    assert.deepEqual([d.available, d.invocation], [true, "/mattpocock-skills:grill-with-docs"]);
    assert.match(d.note, /not verified/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("Spec Kit detection and provider selection", () => {
  const root = mkdtempSync(join(tmpdir(), "factory-sk-"));
  try {
    assert.equal(detectSpecKit(root).available, false);
    mkdirSync(join(root, ".specify"));
    writeFileSync(join(root, ".specify/init-options.json"), JSON.stringify({ speckit_version: "0.8.5" }));
    assert.match(detectSpecKit(root).reason, /not a supported major/);
    writeFileSync(join(root, ".specify/init-options.json"), JSON.stringify({ speckit_version: "1.0.1" }));
    assert.match(detectSpecKit(root).reason, /skills missing/);
    for (const s of ["speckit-specify", "speckit-clarify", "speckit-plan"]) {
      mkdirSync(join(root, ".claude/skills", s), { recursive: true });
      writeFileSync(join(root, ".claude/skills", s, "SKILL.md"), "x");
    }
    const det = detectSpecKit(root);
    assert.deepEqual([det.available, det.version], [true, "1.0.1"]);
    assert.equal(selectSpecProvider("auto", det).provider, "spec-kit");
    assert.equal(selectSpecProvider("local", det).provider, "local");
    const none = { available: false, reason: "absent" };
    assert.equal(selectSpecProvider("spec-kit", none).provider, "local");
    assert.match(selectSpecProvider("spec-kit", none).note, /falling back/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
