import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelCheckoutIntentWithDeps,
  type CheckoutCancelDependencies,
} from "./checkout-intents";

const RESERVATION_ID = "1cddf8d9-38ff-4d90-8b57-030b91082e18";

function dependencies(
  overrides: Partial<CheckoutCancelDependencies> = {},
): CheckoutCancelDependencies {
  return {
    findIntent: async () => ({
      status: "ready",
      stripe_checkout_session_id: "cs_test_open",
    }),
    retrieveSessionStatus: async () => "open",
    expireSession: async () => undefined,
    markExpired: async () => true,
    ...overrides,
  };
}

test("canceling Checkout expires the open Stripe session before releasing its reservation", async () => {
  const calls: string[] = [];
  const result = await cancelCheckoutIntentWithDeps(
    { userId: "user_123", livemode: true, reservationId: RESERVATION_ID },
    dependencies({
      expireSession: async (sessionId) => { calls.push(`expire:${sessionId}`); },
      markExpired: async (sessionId, reservationId) => {
        calls.push(`mark:${sessionId}:${reservationId}`);
        return true;
      },
    }),
  );

  assert.equal(result, "cancelled");
  assert.deepEqual(calls, [
    "expire:cs_test_open",
    `mark:cs_test_open:${RESERVATION_ID}`,
  ]);
});

test("a completed Checkout can never be released as an abandoned session", async () => {
  let expireCalls = 0;
  let markCalls = 0;
  const result = await cancelCheckoutIntentWithDeps(
    { userId: "user_123", livemode: true, reservationId: RESERVATION_ID },
    dependencies({
      retrieveSessionStatus: async () => "complete",
      expireSession: async () => { expireCalls += 1; },
      markExpired: async () => { markCalls += 1; return true; },
    }),
  );

  assert.equal(result, "completed");
  assert.equal(expireCalls, 0);
  assert.equal(markCalls, 0);
});

test("a cancellation cannot touch another account's reservation", async () => {
  let stripeCalls = 0;
  const result = await cancelCheckoutIntentWithDeps(
    { userId: "user_123", livemode: true, reservationId: RESERVATION_ID },
    dependencies({
      findIntent: async () => null,
      retrieveSessionStatus: async () => { stripeCalls += 1; return "open"; },
      expireSession: async () => { stripeCalls += 1; },
      markExpired: async () => { stripeCalls += 1; return true; },
    }),
  );

  assert.equal(result, "missing");
  assert.equal(stripeCalls, 0);
});
