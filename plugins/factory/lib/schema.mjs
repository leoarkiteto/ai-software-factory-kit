// Minimal, zero-dependency JSON Schema validator for the Factory's own schemas.
//
// Supports a deliberately small subset of JSON Schema 2020-12. Any keyword
// outside the subset throws at compile time, so a schema can never be
// silently more permissive than it reads.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ANNOTATIONS = new Set([
  "$schema", "$id", "$defs", "$comment", "title", "description", "default", "examples",
]);
const ASSERTIONS = new Set([
  "$ref", "type", "enum", "const", "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern",
  "minimum", "maximum", "format", "propertyNames", "minProperties",
]);
const TYPES = new Set(["object", "array", "string", "integer", "number", "boolean", "null"]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class SchemaError extends Error {}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected, actual) {
  return expected === actual || (expected === "number" && actual === "integer");
}

/** Walk a schema and reject unsupported keywords. */
function checkKeywords(schema, where) {
  if (typeof schema === "boolean") return;
  if (typeof schema !== "object" || schema === null) {
    throw new SchemaError(`${where}: schema must be an object or boolean`);
  }
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !ASSERTIONS.has(key)) {
      throw new SchemaError(`${where}: unsupported keyword "${key}"`);
    }
  }
  const types = schema.type === undefined ? [] : [].concat(schema.type);
  for (const t of types) {
    if (!TYPES.has(t)) throw new SchemaError(`${where}: unknown type "${t}"`);
  }
  if (schema.format !== undefined && schema.format !== "date-time") {
    throw new SchemaError(`${where}: unsupported format "${schema.format}"`);
  }
  for (const [k, sub] of Object.entries(schema.properties ?? {})) checkKeywords(sub, `${where}/properties/${k}`);
  for (const [k, sub] of Object.entries(schema.$defs ?? {})) checkKeywords(sub, `${where}/$defs/${k}`);
  if (typeof schema.additionalProperties === "object") checkKeywords(schema.additionalProperties, `${where}/additionalProperties`);
  if (schema.items !== undefined) checkKeywords(schema.items, `${where}/items`);
  if (schema.propertyNames !== undefined) checkKeywords(schema.propertyNames, `${where}/propertyNames`);
}

export class SchemaRegistry {
  constructor() {
    this.schemas = new Map();
  }

  add(schema) {
    if (!schema.$id) throw new SchemaError("schema is missing $id");
    checkKeywords(schema, schema.$id);
    this.schemas.set(schema.$id, schema);
    return this;
  }

  /** Load every *.schema.json file in a directory. */
  static fromDirectory(dir) {
    const registry = new SchemaRegistry();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort()) {
      registry.add(JSON.parse(readFileSync(join(dir, file), "utf8")));
    }
    registry.checkRefs();
    return registry;
  }

  /** Verify that every $ref in every schema resolves. */
  checkRefs() {
    const visit = (schema, root, where) => {
      if (typeof schema !== "object" || schema === null) return;
      if (schema.$ref) this.resolve(schema.$ref, root, where);
      for (const [k, sub] of Object.entries(schema.properties ?? {})) visit(sub, root, `${where}/properties/${k}`);
      for (const [k, sub] of Object.entries(schema.$defs ?? {})) visit(sub, root, `${where}/$defs/${k}`);
      if (typeof schema.additionalProperties === "object") visit(schema.additionalProperties, root, where);
      if (schema.items) visit(schema.items, root, `${where}/items`);
    };
    for (const schema of this.schemas.values()) visit(schema, schema, schema.$id);
  }

  resolve(ref, root, where = "") {
    const [base, fragment = ""] = ref.split("#");
    const target = base ? this.schemas.get(base) : root;
    if (!target) throw new SchemaError(`${where}: unresolved $ref "${ref}"`);
    if (!fragment) return { schema: target, root: target };
    let node = target;
    for (const part of fragment.split("/").filter(Boolean)) {
      node = node?.[part];
      if (node === undefined) throw new SchemaError(`${where}: unresolved $ref "${ref}"`);
    }
    return { schema: node, root: target };
  }

  /**
   * Validate `value` against the schema registered as `id`.
   * Returns an array of { path, message }; empty means valid.
   */
  validate(id, value) {
    const schema = this.schemas.get(id);
    if (!schema) throw new SchemaError(`unknown schema "${id}"`);
    const errors = [];
    this.#validate(schema, schema, value, "$", errors);
    return errors;
  }

  #validate(schema, root, value, path, errors) {
    if (schema === true) return;
    if (schema === false) {
      errors.push({ path, message: "is not allowed" });
      return;
    }
    if (schema.$ref) {
      const { schema: target, root: targetRoot } = this.resolve(schema.$ref, root, path);
      this.#validate(target, targetRoot, value, path, errors);
    }

    const actual = typeOf(value);
    if (schema.type !== undefined) {
      const expected = [].concat(schema.type);
      if (!expected.some((t) => typeMatches(t, actual))) {
        errors.push({ path, message: `must be ${expected.join(" or ")}, got ${actual}` });
        return;
      }
    }
    if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
      errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
    }
    if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
      errors.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}` });
    }

    if (actual === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path, message: `must have length >= ${schema.minLength}` });
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path, message: `must have length <= ${schema.maxLength}` });
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push({ path, message: `must match /${schema.pattern}/` });
      if (schema.format === "date-time" && !(DATE_TIME.test(value) && !Number.isNaN(Date.parse(value)))) {
        errors.push({ path, message: "must be an ISO-8601 date-time" });
      }
    }

    if (actual === "integer" || actual === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `must be >= ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `must be <= ${schema.maximum}` });
    }

    if (actual === "array") {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path, message: `must have >= ${schema.minItems} items` });
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path, message: `must have <= ${schema.maxItems} items` });
      if (schema.uniqueItems) {
        const seen = new Set(value.map((v) => JSON.stringify(v)));
        if (seen.size !== value.length) errors.push({ path, message: "must have unique items" });
      }
      if (schema.items !== undefined) {
        value.forEach((item, i) => this.#validate(schema.items, root, item, `${path}[${i}]`, errors));
      }
    }

    if (actual === "object") {
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
        errors.push({ path, message: `must have >= ${schema.minProperties} properties` });
      }
      for (const req of schema.required ?? []) {
        if (!(req in value)) errors.push({ path, message: `missing required property "${req}"` });
      }
      const props = schema.properties ?? {};
      for (const key of keys) {
        const childPath = `${path}.${key}`;
        if (schema.propertyNames) this.#validate(schema.propertyNames, root, key, `${childPath}(name)`, errors);
        if (key in props) {
          this.#validate(props[key], root, value[key], childPath, errors);
        } else if (schema.additionalProperties === false) {
          errors.push({ path: childPath, message: "is not an allowed property" });
        } else if (typeof schema.additionalProperties === "object") {
          this.#validate(schema.additionalProperties, root, value[key], childPath, errors);
        }
      }
    }
  }
}

export function formatErrors(errors) {
  return errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
}
