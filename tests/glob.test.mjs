import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAny, globsMayOverlap } from "../plugins/factory/lib/glob.mjs";

test("glob matching", () => {
  assert.ok(matchesAny("src/api/refunds/routes.ts", ["src/api/refunds/**"]));
  assert.ok(matchesAny("src/api/refunds/routes.ts", ["src/**/*.ts"]));
  assert.ok(matchesAny("src/a.ts", ["src/**/*.ts"]), "** matches zero segments");
  assert.ok(!matchesAny("src/api/refunds.ts", ["src/api/refunds/**"]));
  assert.ok(!matchesAny("src/a/b.ts", ["src/*.ts"]), "* does not cross segments");
  assert.ok(matchesAny("config/.env", [".env"]), "slash-less pattern matches at any depth");
  assert.ok(matchesAny("a.key", ["**/*.key"]));
  assert.ok(!matchesAny("src/a.tsx", ["src/*.ts"]));
});

test("overlap is conservative", () => {
  assert.ok(!globsMayOverlap(["src/api/**"], ["web/src/**"]));
  assert.ok(globsMayOverlap(["src/**"], ["src/api/**"]));
  assert.ok(globsMayOverlap(["src/api/routes.ts"], ["src/api/*.ts"]));
  assert.ok(!globsMayOverlap(["src/api/routes.ts"], ["src/web/*.ts"]));
  assert.ok(globsMayOverlap(["*.md"], ["docs/**"]), "depth-agnostic patterns assume overlap");
  assert.ok(!globsMayOverlap(["tests/refunds/**"], ["src/api/refunds/**"]));
});
