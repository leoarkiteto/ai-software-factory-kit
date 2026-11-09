// Deterministic part of task classification (docs/contracts/classification.md).
// The model supplies dimension scores and rationale; this module computes the
// total, the suggested mode, applies overrides, and validates the result.

import { schemas, schemaId } from "./contracts.mjs";

export const DIMENSIONS = [
  "scope", "complexity", "architecturalImpact", "components", "dependencies",
  "risk", "uncertainty", "testing", "codebaseFamiliarity", "regressionRisk",
];

const RISK_DIMENSIONS = ["risk", "regressionRisk", "architecturalImpact"];

export class ClassificationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

export function totalScore(scores) {
  return DIMENSIONS.reduce((sum, d) => sum + (scores[d] ?? 0), 0);
}

/** Mode implied by the rubric alone. */
export function suggestMode(scores, config) {
  const { standard, fullSpec } = config.classification.thresholds;
  const total = totalScore(scores);
  const escalatedBy = (config.classification.escalateToFullSpecWhenMax ?? []).filter((d) => scores[d] === 2);
  let mode = "quick";
  if (total >= fullSpec || escalatedBy.length) mode = "full_spec";
  else if (total >= standard) mode = "standard";
  return { mode, total, escalatedBy };
}

/**
 * Build a validated classification object.
 * input: { scores, confidence, rationale, evidence?, discoveryJustified?,
 *          forceMode?, forceBy? ("user"|"config"|"escalation"), forceReason? }
 */
export function classify(input, config) {
  const { scores, confidence, rationale, evidence, forceMode, forceBy = "user", forceReason } = input;
  const { mode: suggestedMode, total, escalatedBy } = suggestMode(scores ?? {}, config);
  const discoveryJustified = input.discoveryJustified ?? false;

  const result = { mode: suggestedMode, suggestedMode, scores, total, confidence, discoveryJustified, rationale };
  if (evidence?.length) result.evidence = evidence;
  if (escalatedBy.length && totalScore(scores) < config.classification.thresholds.fullSpec) {
    result.rationale = `${rationale} [escalated to full_spec: ${escalatedBy.join(", ")} scored 2]`;
  }
  if (forceMode && forceMode !== suggestedMode) {
    if (!forceReason) throw new ClassificationError("forcing a mode requires a reason");
    result.mode = forceMode;
    result.override = { by: forceBy, from: suggestedMode, reason: forceReason };
  }

  const errors = schemas().validate(schemaId("classification"), result);
  if (scores && scores.uncertainty !== 2 && discoveryJustified) {
    errors.push({ path: "$.discoveryJustified", message: "discoveryJustified requires uncertainty = 2" });
  }
  if (errors.length) throw new ClassificationError("invalid classification", errors);
  return result;
}

/** Whether to ask the user to confirm the selected mode before proceeding. */
export function needsConfirmation(classification, config) {
  switch (config.classification.confirmWithUser) {
    case "always": return true;
    case "never": return false;
    case "when_not_quick": return classification.mode !== "quick";
    case "when_low_confidence":
    default: return classification.confidence === "low";
  }
}

/**
 * Whether a review of `kind` ("code" | "architecture") is required for a
 * workflow, per config.review.<kind>.<mode> (never | on_risk | always).
 */
export function reviewRequired(kind, mode, classification, config) {
  const policy = config.review?.[kind]?.[mode] ?? "always";
  if (policy === "always") return true;
  if (policy === "never") return false;
  const s = classification?.scores;
  // Without a classification we cannot judge risk: be conservative.
  if (!s) return true;
  return RISK_DIMENSIONS.some((d) => s[d] === 2);
}
