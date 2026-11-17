// Design reference images: download a Figma render into the workflow's
// design/ folder, with the checks ADR-0014 requires (allowed hosts on every
// redirect hop, size cap while streaming, image type from magic bytes).

import { closeSync, fstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, writeFileSync, constants } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { StateError } from "./state.mjs";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 30_000;

// www.figma.com (get_screenshot on the remote server) is confirmed by the
// phase-12 probe; the S3 host and the loopback origin are still unconfirmed
// (docs/research/phase-12-figma-design.md).
const HTTPS_HOST_SUFFIXES = ["figma.com"];
const HTTPS_HOSTS = ["figma-alpha-api.s3.us-west-2.amazonaws.com"];
// The Figma desktop MCP server serves assets on loopback, port 3845.
const LOOPBACK_ORIGINS = ["http://127.0.0.1:3845", "http://localhost:3845"];

/** True when the URL may be fetched: HTTPS on a Figma host, or the desktop server's loopback origin. */
export function isAllowedDesignUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "http:") return LOOPBACK_ORIGINS.includes(u.origin);
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return HTTPS_HOSTS.includes(host) || HTTPS_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** "png" or "jpg" from the file's first bytes, or null. SVG is refused: it is text and can carry script. */
export function imageType(bytes) {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

/** Design reference IDs are D1, D2, … like research's R1, R2, …. */
export function checkDesignId(id) {
  if (!/^D[1-9]\d*$/.test(id ?? "")) throw new StateError(`design ID must look like D1 (got ${id})`);
  return id;
}

/** Figma node IDs ("12:34", "I12:34;56:78") as a file-name-safe slug. */
export function nodeSlug(node) {
  if (!/^[A-Za-z0-9:;_-]{1,64}$/.test(node ?? "")) throw new StateError(`invalid Figma node ID ${node}`);
  return node.replace(/[:;]/g, "-");
}

/**
 * Downloads `url` and returns { bytes, type }. Redirects are followed by hand
 * so every hop is checked against `isAllowed`. Rejects with StateError.
 */
export async function fetchDesignImage(url, { isAllowed = isAllowedDesignUrl, fetchImpl = globalThis.fetch, maxBytes = MAX_IMAGE_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new StateError("this Node.js has no fetch (needs Node 18 or later)");
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!isAllowed(current)) throw new StateError(`URL not allowed for design images: ${redact(current)} (only Figma hosts)`);
    let res;
    try {
      res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new StateError(`download failed: ${e.name === "TimeoutError" ? "timed out" : e.message}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new StateError(`redirect without a location (HTTP ${res.status})`);
      if (hop >= MAX_REDIRECTS) throw new StateError("too many redirects");
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) throw new StateError(`download failed: HTTP ${res.status}${res.status === 403 || res.status === 404 ? " (the Figma URL may have expired: ask for a fresh one)" : ""}`);
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) throw new StateError(`image is larger than ${maxBytes} bytes`);
    const bytes = await readCapped(res, maxBytes);
    const type = imageType(bytes);
    if (!type) throw new StateError("downloaded file is not a PNG or JPEG image");
    return { bytes, type };
  }
}

/**
 * Where Claude Code saves images an MCP tool returned inline (phase-12 probe,
 * session 2): <config dir>/projects/<project>/<session>/tool-results/.
 */
export function claudeProjectsDir(env = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
}

/**
 * Reads a render that a Figma tool returned inline and Claude Code saved to a
 * session's tool-results/ folder. Returns { bytes, type }. Only regular PNG or
 * JPEG files directly inside a tool-results/ folder under `projectsDir` are
 * accepted (symlinks are resolved first), so the command cannot copy other
 * files into the repository. Throws StateError.
 */
export function readSavedDesignImage(path, { projectsDir = claudeProjectsDir(), maxBytes = MAX_IMAGE_BYTES } = {}) {
  let real, root;
  try {
    real = realpathSync(path);
  } catch {
    throw new StateError(`saved image not found: ${path}`);
  }
  try {
    root = realpathSync(projectsDir);
  } catch {
    throw new StateError(`Claude Code projects folder not found: ${projectsDir}`);
  }
  if (!real.startsWith(root + sep) || basename(dirname(real)) !== "tool-results") {
    throw new StateError(`saved image must be in a Claude Code session's tool-results folder under ${projectsDir}`);
  }
  let fd;
  try {
    fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (e) {
    throw new StateError(`cannot read saved image: ${e.code ?? e.message}`);
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new StateError("saved image is not a regular file");
    if (st.size > maxBytes) throw new StateError(`image is larger than ${maxBytes} bytes`);
    const bytes = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, bytes, off, st.size - off, off);
      if (n === 0) break;
      off += n;
    }
    const out = bytes.subarray(0, off);
    const type = imageType(out);
    if (!type) throw new StateError("saved file is not a PNG or JPEG image");
    return { bytes: out, type };
  } finally {
    closeSync(fd);
  }
}

async function readCapped(res, maxBytes) {
  const chunks = [];
  let total = 0;
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new StateError(`image is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export function writeBytesAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, path);
}

// Signed Figma URLs carry credentials in the query string; never echo it.
function redact(raw) {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return "(unparseable URL)";
  }
}
