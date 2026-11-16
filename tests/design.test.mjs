import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllowedDesignUrl, imageType, checkDesignId, nodeSlug, fetchDesignImage } from "../plugins/factory/lib/design.mjs";
import { StateError } from "../plugins/factory/lib/state.mjs";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test("only Figma hosts over HTTPS, or the desktop server's loopback origin, are allowed", () => {
  for (const ok of [
    "https://figma.com/x.png",
    "https://www.figma.com/api/mcp/asset/abc",
    "https://s3-alpha.figma.com/img/1/2",
    "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc?X-Amz-Signature=1",
    "http://127.0.0.1:3845/assets/abc.png",
    "http://localhost:3845/assets/abc.png",
  ]) assert.equal(isAllowedDesignUrl(ok), true, ok);
  for (const bad of [
    "http://www.figma.com/x.png",
    "https://evilfigma.com/x.png",
    "https://figma.com.evil.example/x.png",
    "https://figma.com:8443/x.png",
    "https://user:pw@www.figma.com/x.png",
    "https://other-bucket.s3.us-west-2.amazonaws.com/x.png",
    "http://127.0.0.1:8080/x.png",
    "file:///etc/passwd",
    "not a url",
  ]) assert.equal(isAllowedDesignUrl(bad), false, bad);
});

test("image type comes from magic bytes; SVG and other content are refused", () => {
  assert.equal(imageType(PNG), "png");
  assert.equal(imageType(JPG), "jpg");
  assert.equal(imageType(SVG), null);
  assert.equal(imageType(Buffer.from("GIF89a")), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

test("design IDs and node slugs are validated", () => {
  assert.equal(checkDesignId("D1"), "D1");
  assert.equal(checkDesignId("D12"), "D12");
  for (const bad of ["D0", "d1", "R1", "D1/../x", undefined]) assert.throws(() => checkDesignId(bad), StateError);
  assert.equal(nodeSlug("12:34"), "12-34");
  assert.equal(nodeSlug("I12:34;56:78"), "I12-34-56-78");
  for (const bad of ["../x", "12/34", "", "a b"]) assert.throws(() => nodeSlug(bad), StateError);
});

let server, base;
before(async () => {
  server = createServer((req, res) => {
    const routes = {
      "/ok.png": () => res.end(PNG),
      "/ok.jpg": () => res.end(JPG),
      "/evil.svg": () => res.end(SVG),
      "/big": () => {
        res.write(Buffer.concat([PNG, Buffer.alloc(64)]));
        res.end(Buffer.alloc(64));
      },
      "/big-declared": () => {
        res.writeHead(200, { "content-length": "999999" });
        res.end(PNG);
      },
      "/expired": () => {
        res.statusCode = 403;
        res.end("expired");
      },
      "/redirect-ok": () => {
        res.writeHead(302, { location: "/ok.png" });
        res.end();
      },
      "/redirect-out": () => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
        res.end();
      },
      "/loop": () => {
        res.writeHead(302, { location: "/loop" });
        res.end();
      },
    };
    (routes[req.url] ?? (() => { res.statusCode = 404; res.end(); }))();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const local = (u) => u.startsWith(base);
const get = (path, opts = {}) => fetchDesignImage(`${base}${path}`, { isAllowed: local, ...opts });

test("downloads PNG and JPEG and follows allowed redirects", async () => {
  assert.equal((await get("/ok.png")).type, "png");
  assert.equal((await get("/ok.jpg")).type, "jpg");
  assert.deepEqual([...(await get("/redirect-ok")).bytes], [...PNG]);
});

test("refuses non-images, oversize bodies, expired URLs and redirects off the allowed hosts", async () => {
  await assert.rejects(get("/evil.svg"), /not a PNG or JPEG/);
  await assert.rejects(get("/big", { maxBytes: 64 }), /larger than 64 bytes/);
  await assert.rejects(get("/big-declared", { maxBytes: 1000 }), /larger than 1000 bytes/);
  await assert.rejects(get("/expired"), /HTTP 403.*expired/);
  await assert.rejects(get("/redirect-out"), /not allowed/);
  await assert.rejects(get("/loop"), /too many redirects/);
});

test("the default allow-list refuses a non-Figma URL without any request, and hides the query", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  await assert.rejects(fetchDesignImage("https://example.com/a.png?token=secret", { fetchImpl }), (e) => {
    assert.match(e.message, /not allowed/);
    assert.doesNotMatch(e.message, /secret/);
    return true;
  });
  assert.equal(called, false);
});

test("CLI fetch-design-image validates arguments and refuses non-Figma URLs", () => {
  const repo = mkdtempSync(join(tmpdir(), "factory-design-repo-"));
  const installed = mkdtempSync(join(tmpdir(), "factory-design-plugin-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    cpSync(new URL("../plugins/factory/", import.meta.url).pathname, join(installed, "factory"), { recursive: true });
    const cli = join(installed, "factory", "bin", "factory-state");
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const fs = (...args) => {
      const r = spawnSync(cli, [...args, "--root", repo], { encoding: "utf8", env });
      return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
    };
    const id = fs("new", "--title", "Orders filter", "--request", "Build the filter from figma").out;
    assert.equal(fs("fetch-design-image", id, "D1", "--node", "12:34").code, 2, "--url is required");
    const badId = fs("fetch-design-image", id, "R1", "--node", "12:34", "--url", "https://www.figma.com/a.png");
    assert.equal(badId.code, 1);
    assert.match(badId.err, /design ID/);
    const offsite = fs("fetch-design-image", id, "D1", "--node", "12:34", "--url", "https://example.com/a.png");
    assert.equal(offsite.code, 1);
    assert.match(offsite.err, /not allowed/);
    assert.equal(existsSync(join(repo, ".factory", "workflows", id, "design")), false);

    // The design artifact kind keeps a list, like research.
    const note = join(".factory", "workflows", id, "design", "D1.md");
    assert.equal(fs("artifact", id, "design", note).code, 0);
    const manifest = JSON.parse(readFileSync(join(repo, ".factory", "workflows", id, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.artifacts.design, [note]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(installed, { recursive: true, force: true });
  }
});
