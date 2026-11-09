// Minimal glob matching for repository-relative POSIX paths.
// Supports: `**` (any number of path segments), `*` (within a segment), `?`.
// A pattern without a slash also matches at any depth (gitignore-like),
// e.g. ".env" matches "config/.env".

const cache = new Map();

export function globToRegExp(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  let p = pattern.replace(/^\.\//, "");
  const anyDepth = !p.includes("/");
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        const slashAfter = p[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  const full = new RegExp(`^${anyDepth ? "(?:.*/)?" : ""}${re}$`);
  cache.set(pattern, full);
  return full;
}

export function matchesAny(path, patterns) {
  return patterns.some((p) => globToRegExp(p).test(path));
}

/**
 * Conservative overlap test between two glob sets: true when they may
 * select a common path. Used to decide whether two tasks can run in
 * parallel; false positives only cost parallelism, never safety.
 */
export function globsMayOverlap(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (globPairMayOverlap(x, y)) return true;
    }
  }
  return false;
}

function staticPrefix(pattern) {
  const p = pattern.replace(/^\.\//, "");
  const idx = p.search(/[*?]/);
  return idx === -1 ? p : p.slice(0, idx);
}

function globPairMayOverlap(x, y) {
  const rx = globToRegExp(x);
  const ry = globToRegExp(y);
  // A literal path on either side can be tested exactly.
  if (!/[*?]/.test(x)) return ry.test(x.replace(/^\.\//, ""));
  if (!/[*?]/.test(y)) return rx.test(y.replace(/^\.\//, ""));
  // Depth-agnostic patterns (no slash) can match anywhere: assume overlap.
  if (!x.includes("/") || !y.includes("/")) return true;
  // Otherwise overlap is possible only if one static prefix extends the other.
  const px = staticPrefix(x);
  const py = staticPrefix(y);
  return px.startsWith(py) || py.startsWith(px);
}
