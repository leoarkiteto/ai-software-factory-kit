// The user guides ship in English (default) and Brazilian Portuguese
// (*.pt-br.md next to each English file). These checks keep the two in step:
// every translated document has its pair, both carry the language switcher,
// and their relative links and anchors resolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, normalize, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const GUIDE = join(ROOT, "docs/guide");

const EN_DOCS = [
  join(ROOT, "README.md"),
  join(ROOT, "plugins/factory/README.md"),
  ...readdirSync(GUIDE).filter((f) => f.endsWith(".md") && !f.endsWith(".pt-br.md")).map((f) => join(GUIDE, f)),
];
const ptOf = (en) => en.replace(/\.md$/, ".pt-br.md");
const rel = (p) => relative(ROOT, p);

// GitHub's heading anchors: lowercase, punctuation dropped (letters with
// accents kept), spaces become hyphens.
function anchors(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => /^#{1,6} /.test(l))
    .map((l) => l.replace(/^#+ /, "").trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-"));
}

function links(path) {
  // Skip fenced code blocks, where [x](y) is not a link.
  const text = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "");
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u));
}

test("every English guide has a pt-br version, and every pt-br file has an English original", () => {
  for (const en of EN_DOCS) assert.ok(existsSync(ptOf(en)), `missing translation: ${rel(ptOf(en))}`);
  const pts = readdirSync(GUIDE).filter((f) => f.endsWith(".pt-br.md")).map((f) => join(GUIDE, f));
  for (const pt of pts) assert.ok(existsSync(pt.replace(/\.pt-br\.md$/, ".md")), `orphan translation: ${rel(pt)}`);
});

test("both language versions start with the language switcher", () => {
  for (const en of EN_DOCS) {
    const name = basename(en, ".md");
    const enFirst = readFileSync(en, "utf8").split("\n")[0];
    const ptFirst = readFileSync(ptOf(en), "utf8").split("\n")[0];
    assert.equal(enFirst, `**English** · [Português (Brasil)](${name}.pt-br.md)`, `${rel(en)}: switcher`);
    assert.equal(ptFirst, `[English](${name}.md) · **Português (Brasil)**`, `${rel(ptOf(en))}: switcher`);
  }
});

test("relative links and anchors resolve in both languages", () => {
  for (const file of EN_DOCS.flatMap((en) => [en, ptOf(en)])) {
    for (const url of links(file)) {
      const [path, anchor] = url.split("#");
      const target = path ? normalize(join(dirname(file), path)) : file;
      assert.ok(existsSync(target), `${rel(file)}: broken link ${url}`);
      if (anchor && target.endsWith(".md")) {
        assert.ok(anchors(target).includes(decodeURIComponent(anchor)), `${rel(file)}: missing anchor ${url}`);
      }
    }
  }
});

test("pt-br guides link to pt-br guides, not to the English ones", () => {
  for (const en of EN_DOCS.filter((p) => dirname(p) === GUIDE)) {
    const pt = ptOf(en);
    for (const url of links(pt).slice(1)) {
      const path = url.split("#")[0];
      if (!path || dirname(normalize(join(GUIDE, path))) !== GUIDE) continue;
      assert.match(path, /\.pt-br\.md$/, `${rel(pt)}: links to English guide ${url}`);
    }
  }
});
