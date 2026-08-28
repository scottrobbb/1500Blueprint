import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./verify-remote-security.ts", import.meta.url), "utf8");

test("hosted verification checks direct content denial without reading row bodies", () => {
  for (const table of ["tests", "questions", "choices", "drill_questions", "users"]) {
    assert.match(source, new RegExp(`"${table}"`));
  }
  assert.match(source, /select\("\*", \{ head: true, count: "exact" \}\)/);
  assert.match(source, /if \(!result\.error\)/);
});

test("hosted verification checks billing health and both storage invariants", () => {
  assert.match(source, /get_billing_integrity_health/);
  assert.match(source, /course-assets/);
  assert.match(source, /524_288_000/);
  assert.match(source, /figures/);
  assert.match(source, /10_485_760/);
  assert.match(source, /process\.exitCode = 1/);
});
