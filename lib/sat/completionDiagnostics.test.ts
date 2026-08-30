import assert from "node:assert/strict";
import test from "node:test";
import {
  completionFailureReference,
  parseCompletionFailureDiagnostic,
} from "./completionDiagnostics";

test("completion diagnostics keep only bounded operational metadata", () => {
  const parsed = parseCompletionFailureDiagnostic({
    requestId: "8c79ca60-0df4-4c51-9d63-6d875ed9c571",
    testSlug: "practice-test-7",
    kind: "http",
    code: "rate_limited",
    errorName: "CompletionResponseError",
    status: 429,
    answers: { question: "secret" },
  });
  assert.deepEqual(parsed, {
    requestId: "8c79ca60-0df4-4c51-9d63-6d875ed9c571",
    testSlug: "practice-test-7",
    kind: "http",
    code: "rate_limited",
    errorName: "CompletionResponseError",
    status: 429,
  });
  assert.equal(completionFailureReference(parsed!), "8c79ca60");
});

test("completion diagnostics reject hostile or unbounded identifiers", () => {
  assert.equal(parseCompletionFailureDiagnostic({
    requestId: "bad request id",
    testSlug: "practice-test-7",
    kind: "network",
    code: "fetch_failed",
    errorName: "TypeError",
  }), null);
  assert.equal(parseCompletionFailureDiagnostic({
    requestId: "safe-request",
    testSlug: "../practice-test-7",
    kind: "network",
    code: "fetch_failed",
    errorName: "TypeError",
  }), null);
});
