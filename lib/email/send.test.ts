import assert from "node:assert/strict";
import test from "node:test";
import type { ErrorResponse } from "resend";
import { EmailDeliveryError, sendEmailWithRetry } from "./send";

test("tracked sending retries a transient Resend response and returns one message id", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await sendEmailWithRetry(
    async () => {
      attempts += 1;
      return attempts === 1
        ? { data: null, error: resendError("rate_limit_exceeded", 429) }
        : { data: { id: "email-1" }, error: null };
    },
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.deepEqual(result, { id: "email-1" });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1000]);
});

test("tracked sending does not retry permanent validation failures", async () => {
  let attempts = 0;
  await assert.rejects(
    sendEmailWithRetry(
      async () => {
        attempts += 1;
        return { data: null, error: resendError("validation_error", 400) };
      },
      async () => undefined,
    ),
    (error: unknown) => error instanceof EmailDeliveryError && error.code === "validation_error",
  );
  assert.equal(attempts, 1);
});

function resendError(name: string, statusCode: number): ErrorResponse {
  return { name, statusCode, message: name } as ErrorResponse;
}
