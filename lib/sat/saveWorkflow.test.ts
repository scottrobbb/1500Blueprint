import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const runner = readFileSync(join(process.cwd(), "components/test/TestRunner.tsx"), "utf8");
const completionRoute = readFileSync(join(process.cwd(), "app/api/tests/complete/route.ts"), "utf8");

test("practice-test session saves are serialized and explicit exits capture current state", () => {
  assert.match(runner, /saveQueue\.run\(save\)/);
  assert.match(
    runner,
    /persist\(\{\s*state,\s*highlights,\s*reason:\s*["']exit["']/,
  );
});

test("completion saves avoid keepalive quota and carry a searchable request id", () => {
  const completionRequest = runner.slice(
    runner.indexOf('fetch("/api/tests/complete"'),
    runner.indexOf("const data =", runner.indexOf('fetch("/api/tests/complete"')),
  );
  assert.doesNotMatch(completionRequest, /keepalive/);
  assert.match(completionRequest, /x-client-request-id/);
  assert.match(completionRoute, /practice_test\.completion\.rejected/);
  assert.match(completionRoute, /practice_test\.completion\.saved/);
});
