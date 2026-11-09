import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, suggestMode, needsConfirmation, reviewRequired, DIMENSIONS, ClassificationError } from "../plugins/factory/lib/classify.mjs";
import { loadDefaults, resolveConfig } from "../plugins/factory/lib/contracts.mjs";

const config = loadDefaults();
const scores = (over = {}) => Object.fromEntries(DIMENSIONS.map((d) => [d, over[d] ?? 0]));
const base = { confidence: "high", rationale: "r" };

test("thresholds select quick / standard / full_spec", () => {
  assert.equal(suggestMode(scores({ scope: 1, testing: 1 }), config).mode, "quick");
  assert.equal(suggestMode(scores({ scope: 1, components: 1, risk: 1, testing: 1, complexity: 1 }), config).mode, "standard");
  const big = scores(Object.fromEntries(DIMENSIONS.slice(0, 6).map((d) => [d, 2])));
  assert.equal(suggestMode(big, config).mode, "full_spec");
  assert.equal(suggestMode(big, config).total, 12);
});

test("boundary values are inclusive", () => {
  const four = scores({ scope: 1, components: 1, risk: 1, testing: 1 });
  assert.equal(suggestMode(four, config).mode, "quick");
  assert.equal(suggestMode({ ...four, complexity: 1 }, config).mode, "standard");
});

test("architecturalImpact = 2 escalates to full_spec regardless of total", () => {
  const r = classify({ ...base, scores: scores({ architecturalImpact: 2 }) }, config);
  assert.equal(r.mode, "full_spec");
  assert.match(r.rationale, /escalated to full_spec: architecturalImpact/);
});

test("uncertainty alone does not escalate", () => {
  const r = classify({ ...base, scores: scores({ uncertainty: 2, scope: 1 }), discoveryJustified: true }, config);
  assert.equal(r.mode, "quick");
  assert.equal(r.discoveryJustified, true);
});

test("discoveryJustified requires uncertainty = 2", () => {
  assert.throws(() => classify({ ...base, scores: scores({ uncertainty: 1 }), discoveryJustified: true }, config), ClassificationError);
});

test("forced mode records an override with the suggested mode", () => {
  const r = classify({ ...base, scores: scores(), forceMode: "standard", forceReason: "user asked for a plan" }, config);
  assert.equal(r.mode, "standard");
  assert.deepEqual(r.override, { by: "user", from: "quick", reason: "user asked for a plan" });
  assert.throws(() => classify({ ...base, scores: scores(), forceMode: "standard" }, config), /requires a reason/);
});

test("invalid scores are rejected", () => {
  assert.throws(() => classify({ ...base, scores: { ...scores(), risk: 3 } }, config), ClassificationError);
  const { risk, ...missing } = scores();
  assert.throws(() => classify({ ...base, scores: missing }, config), ClassificationError);
});

test("custom thresholds and escalators from config", () => {
  const { config: c } = resolveConfig({ schemaVersion: 1, classification: { thresholds: { standard: 2, fullSpec: 4 }, escalateToFullSpecWhenMax: ["risk"] } });
  assert.equal(suggestMode(scores({ scope: 1, testing: 1 }), c).mode, "standard");
  assert.equal(suggestMode(scores({ risk: 2 }), c).mode, "full_spec");
  assert.equal(suggestMode(scores({ architecturalImpact: 2 }), c).mode, "standard", "default escalator replaced");
});

test("confirmation policy", () => {
  const low = { mode: "quick", confidence: "low" };
  const high = { mode: "standard", confidence: "high" };
  assert.equal(needsConfirmation(low, config), true);
  assert.equal(needsConfirmation(high, config), false);
  const { config: c } = resolveConfig({ schemaVersion: 1, classification: { confirmWithUser: "when_not_quick" } });
  assert.equal(needsConfirmation(high, c), true);
  assert.equal(needsConfirmation(low, c), false);
});

test("review policy per mode and risk", () => {
  const calm = { scores: scores() };
  const risky = { scores: scores({ risk: 2 }) };
  assert.equal(reviewRequired("code", "quick", calm, config), false);
  assert.equal(reviewRequired("code", "quick", risky, config), true);
  assert.equal(reviewRequired("code", "standard", calm, config), true);
  assert.equal(reviewRequired("architecture", "quick", risky, config), false);
  assert.equal(reviewRequired("architecture", "standard", calm, config), false);
  assert.equal(reviewRequired("architecture", "standard", risky, config), true);
  assert.equal(reviewRequired("architecture", "full_spec", calm, config), true);
  assert.equal(reviewRequired("code", "quick", undefined, config), true, "no classification: conservative");
});
