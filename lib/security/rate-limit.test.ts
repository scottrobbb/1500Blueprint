import assert from "node:assert/strict";
import test from "node:test";
import { parseRateLimitResult } from "./rate-limit-result";

test("parseRateLimitResult accepts the RPC contract", () => {
  assert.deepEqual(parseRateLimitResult({
    allowed: true,
    used: 2,
    limit: 5,
    resetsAt: "2026-08-27T20:00:00.000Z",
  }), {
    allowed: true,
    used: 2,
    limit: 5,
    resetsAt: "2026-08-27T20:00:00.000Z",
  });
});

test("parseRateLimitResult rejects malformed RPC responses", () => {
  assert.throws(() => parseRateLimitResult(null));
  assert.throws(() => parseRateLimitResult({ allowed: true, used: -1, limit: 5, resetsAt: "soon" }));
  assert.throws(() => parseRateLimitResult({ allowed: "yes", used: 1, limit: 5, resetsAt: new Date().toISOString() }));
});
