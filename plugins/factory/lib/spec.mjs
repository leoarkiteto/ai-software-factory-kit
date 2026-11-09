// Deterministic completeness checks for specification and discovery artifacts
// (docs/contracts/specification-provider.md §1, discovery-provider.md §4).
// These check structure and traceability, not quality.

const ID_DEF = /^\s*[-*]\s+\*\*((?:FR|NFR|AC|SC)-\d{1,3}):?\*\*/;
const ID_ANY = /\b((?:FR|NFR|AC|SC)-\d{1,3})\b/g;
const NONE = /^\s*[-*]?\s*(none|none identified|n\/a)\.?\s*$/i;

/** FR-001 and FR-1 compare equal. */
export const normId = (id) => id.replace(/-0*(\d+)$/, "-$1");

/** Split markdown into { normalisedHeading: body } for `##` sections. */
export function sections(markdown) {
  const out = {};
  let current = null;
  for (const line of markdown.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h && !line.startsWith("###")) {
      current = h[1].toLowerCase().replace(/[*_`]/g, "").replace(/\s*\(.*\)\s*$/, "").trim();
      out[current] = "";
    } else if (current !== null) {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

function definitions(text) {
  const defs = [];
  for (const line of (text ?? "").split("\n")) {
    const m = line.match(ID_DEF);
    if (m) defs.push({ id: m[1], line, refs: [...line.replace(ID_DEF, "").matchAll(ID_ANY)].map((x) => x[1]) });
  }
  return defs;
}

function bullets(text) {
  return (text ?? "").split("\n").filter((l) => /^\s*[-*]\s+\S/.test(l));
}

function isEmptyOrNone(text) {
  const lines = (text ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("<!--"));
  return lines.length === 0 || lines.every((l) => NONE.test(l));
}

function find(secs, ...names) {
  for (const n of names) if (secs[n] !== undefined) return secs[n];
  return undefined;
}

function checkCommon(errors, defs, acs) {
  const all = [...defs.FR, ...defs.NFR, ...acs, ...defs.SC];
  const seen = new Set();
  for (const d of all) {
    const k = normId(d.id);
    if (seen.has(k)) errors.push(`duplicate ID ${d.id}`);
    seen.add(k);
  }
  if (!defs.FR.length) errors.push("no functional requirements (FR-n) defined");
  if (!acs.length) errors.push("no acceptance criteria (AC-n) defined");
  const reqIds = new Set([...defs.FR, ...defs.NFR].map((d) => normId(d.id)));
  const covered = new Set();
  for (const ac of acs) {
    const refs = ac.refs.filter((r) => /^(FR|NFR)-/.test(r));
    if (!refs.length) errors.push(`${ac.id} references no requirement`);
    for (const r of refs) {
      if (!reqIds.has(normId(r))) errors.push(`${ac.id} references unknown ${r}`);
      covered.add(normId(r));
    }
  }
  for (const fr of defs.FR) if (!covered.has(normId(fr.id))) errors.push(`${fr.id} is not covered by any acceptance criterion`);
}

function checkOpenQuestions(errors, text, label = "open questions") {
  if (text === undefined || isEmptyOrNone(text)) return;
  for (const b of bullets(text)) {
    if (NONE.test(b)) continue;
    if (!/non-blocking/i.test(b)) errors.push(`${label}: item not marked non-blocking: ${b.trim().slice(0, 80)}`);
  }
}

function result(errors, defs, acs) {
  return {
    ok: errors.length === 0,
    errors,
    ids: {
      FR: defs.FR.map((d) => d.id), NFR: defs.NFR.map((d) => d.id),
      AC: acs.map((d) => d.id), SC: defs.SC.map((d) => d.id),
    },
  };
}

/** Local Factory template (`core/templates/spec.md`). */
export function checkLocalSpec(markdown) {
  const errors = [];
  const secs = sections(markdown);
  const required = ["summary", "scope", "functional requirements", "non-functional requirements", "acceptance criteria",
    "edge cases", "constraints and assumptions", "validation requirements", "open questions"];
  for (const r of required) if (secs[r] === undefined) errors.push(`missing section "## ${r}"`);
  if (secs.scope !== undefined && !(/in scope/i.test(secs.scope) && /out of scope/i.test(secs.scope))) {
    errors.push("scope must state both In scope and Out of scope");
  }
  const defs = {
    FR: definitions(secs["functional requirements"]).filter((d) => d.id.startsWith("FR-")),
    NFR: definitions(secs["non-functional requirements"]).filter((d) => d.id.startsWith("NFR-")),
    SC: [],
  };
  if (secs["non-functional requirements"] !== undefined && !defs.NFR.length && !/none identified/i.test(secs["non-functional requirements"])) {
    errors.push('non-functional requirements: define NFR-n or state "None identified"');
  }
  for (const s of ["summary", "validation requirements"]) {
    if (secs[s] !== undefined && isEmptyOrNone(secs[s])) errors.push(`section "${s}" is empty`);
  }
  const acs = definitions(secs["acceptance criteria"]).filter((d) => d.id.startsWith("AC-"));
  checkCommon(errors, defs, acs);
  checkOpenQuestions(errors, secs["open questions"]);
  if (/\[NEEDS CLARIFICATION/i.test(markdown)) errors.push("unresolved [NEEDS CLARIFICATION] marker");
  return result(errors, defs, acs);
}

/**
 * Spec Kit spec plus the Factory's supplements in plan.md:
 * `## Spec supplements` (Scope / Non-functional requirements / Validation requirements as ### subsections)
 * and `## Acceptance criteria mapping` table rows `| AC-n | <source> | FR-001, ... |`.
 */
export function checkSpecKitSpec(specMarkdown, planMarkdown = "") {
  const errors = [];
  if (/\[NEEDS CLARIFICATION/i.test(specMarkdown)) errors.push("unresolved [NEEDS CLARIFICATION] marker in the Spec Kit spec: run speckit-clarify");
  const specDefs = definitions(specMarkdown);
  const defs = {
    FR: specDefs.filter((d) => d.id.startsWith("FR-")),
    NFR: [],
    SC: specDefs.filter((d) => d.id.startsWith("SC-")),
  };
  const planSecs = sections(planMarkdown);
  const supplements = find(planSecs, "spec supplements");
  if (supplements === undefined) errors.push('plan.md is missing "## Spec supplements"');
  else {
    if (!(/in scope/i.test(supplements) && /out of scope/i.test(supplements))) errors.push("spec supplements must state In scope and Out of scope");
    if (!/non-functional/i.test(supplements)) errors.push("spec supplements must address non-functional requirements");
    if (!/validation/i.test(supplements)) errors.push("spec supplements must state validation requirements");
    defs.NFR = definitions(supplements).filter((d) => d.id.startsWith("NFR-"));
  }
  const mapping = find(planSecs, "acceptance criteria mapping");
  const acs = [];
  if (mapping === undefined) errors.push('plan.md is missing "## Acceptance criteria mapping"');
  else {
    for (const line of mapping.split("\n")) {
      const m = line.match(/^\|\s*(AC-\d{1,3})\s*\|([^|]*)\|([^|]*)\|/);
      if (m) acs.push({ id: m[1], refs: [...m[3].matchAll(ID_ANY)].map((x) => x[1]), source: m[2].trim() });
    }
  }
  if (!defs.SC.length) errors.push("no success criteria (SC-n) in the Spec Kit spec");
  checkCommon(errors, defs, acs);
  return result(errors, defs, acs);
}

/** discovery-summary.md: required sections and no blocking open questions. */
export function checkDiscoverySummary(markdown) {
  const errors = [];
  const secs = sections(markdown);
  const required = ["provider", "decisions", "vocabulary", "behaviour", "constraints and assumptions", "scope",
    "non-blocking open questions", "blocking open questions", "docs changed"];
  for (const r of required) if (secs[r] === undefined) errors.push(`missing section "## ${r}"`);
  const blocking = secs["blocking open questions"];
  if (blocking !== undefined && !isEmptyOrNone(blocking)) {
    errors.push(`blocking open questions remain: ${bullets(blocking).length || "see section"}`);
  }
  if (secs.provider !== undefined && isEmptyOrNone(secs.provider)) errors.push("provider section must name the provider and evidence");
  return { ok: errors.length === 0, errors };
}
