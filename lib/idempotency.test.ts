import assert from "node:assert/strict";
import test from "node:test";
import { readIdempotencyToken } from "./idempotency";

test("idempotency tokens accept browser UUIDs and bounded opaque values", () => {
  assert.equal(
    readIdempotencyToken("1cddf8d9-38ff-4d90-8b57-030b91082e18"),
    "1cddf8d9-38ff-4d90-8b57-030b91082e18",
  );
  assert.equal(readIdempotencyToken("attempt_1234"), "attempt_1234");
});

test("idempotency tokens reject missing, hostile, and unbounded values", () => {
  assert.equal(readIdempotencyToken(null), null);
  assert.equal(readIdempotencyToken("short"), null);
  assert.equal(readIdempotencyToken(" token_1234"), null);
  assert.equal(readIdempotencyToken("token/1234"), null);
  assert.equal(readIdempotencyToken("x".repeat(161)), null);
});
