import assert from "node:assert/strict";
import test from "node:test";
import { safeErrorLabel, safeErrorMetadata } from "./error-metadata";

test("error metadata retains operational identifiers without messages or stacks", () => {
  const error = Object.assign(new Error("customer dawson@example.com failed"), {
    type: "StripeInvalidRequestError",
    code: "resource_missing",
    statusCode: 404,
    requestId: "req_123",
  });

  assert.deepEqual(safeErrorMetadata(error), {
    name: "Error",
    type: "StripeInvalidRequestError",
    code: "resource_missing",
    status: 404,
    requestId: "req_123",
  });
  assert.equal(JSON.stringify(safeErrorMetadata(error)).includes("dawson@example.com"), false);
  assert.equal(safeErrorLabel(error), "Error:StripeInvalidRequestError:resource_missing:404");
});

test("error metadata drops attacker-controlled identifiers", () => {
  assert.deepEqual(safeErrorMetadata({
    name: "Error\nforged",
    code: "email@example.com",
    requestId: "x".repeat(129),
  }), { name: "Error" });
  assert.deepEqual(safeErrorMetadata("failure"), { name: "UnknownError" });
});
