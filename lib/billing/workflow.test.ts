import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutRequestToken,
  legacyImportBlockingReasons,
  parseCheckoutIntentClaim,
  stripeCheckoutIdempotencyKey,
  subscriptionIdentityConflict,
  webhookAuditPayload,
  webhookClaimDecision,
} from "./workflow";

test("checkout request tokens are validated before a durable reservation", () => {
  const token = "1cddf8d9-38ff-4d90-8b57-030b91082e18";
  assert.equal(checkoutRequestToken(token), token);
  assert.equal(checkoutRequestToken("short"), null);
  assert.equal(checkoutRequestToken("x".repeat(101)), null);
});

test("Stripe idempotency follows the durable reservation, not a browser tab", () => {
  const reservationId = "1cddf8d9-38ff-4d90-8b57-030b91082e18";
  assert.equal(
    stripeCheckoutIdempotencyKey(reservationId),
    `blueprint-checkout-${reservationId}`,
  );
  assert.equal(stripeCheckoutIdempotencyKey("account_123"), null);
});

test("checkout reservation results only permit Stripe-hosted ready redirects", () => {
  const row = {
    decision: "ready",
    reservation_id: "1cddf8d9-38ff-4d90-8b57-030b91082e18",
    checkout_expires_at: "2026-08-27T22:00:00.000Z",
    stripe_checkout_session_url: "https://checkout.stripe.com/c/pay/cs_test_123",
  };
  assert.deepEqual(parseCheckoutIntentClaim(row), {
    decision: "ready",
    reservationId: row.reservation_id,
    checkoutExpiresAt: row.checkout_expires_at,
    checkoutUrl: row.stripe_checkout_session_url,
  });
  assert.equal(parseCheckoutIntentClaim({
    ...row,
    stripe_checkout_session_url: "https://competitor.example/checkout",
  }), null);
  assert.deepEqual(parseCheckoutIntentClaim({
    ...row,
    decision: "busy",
    stripe_checkout_session_url: null,
  }), {
    decision: "busy",
    reservationId: row.reservation_id,
    checkoutExpiresAt: row.checkout_expires_at,
    checkoutUrl: null,
  });
});

test("subscription synchronization refuses identity reassignment", () => {
  const current = { userId: "user_1", customerId: "cus_1", livemode: false };
  assert.equal(subscriptionIdentityConflict(current, current), null);
  assert.equal(subscriptionIdentityConflict(current, { ...current, userId: "user_2" }), "user");
  assert.equal(subscriptionIdentityConflict(current, { ...current, customerId: "cus_2" }), "customer");
  assert.equal(subscriptionIdentityConflict(current, { ...current, livemode: true }), "mode");
});

test("legacy import applies only after every customer and subscription is unambiguous", () => {
  assert.deepEqual(legacyImportBlockingReasons({
    duplicateCustomerAccounts: 0,
    duplicateActiveSubscriptionAccounts: 0,
    unknownSubscriptions: 0,
  }), []);
  assert.deepEqual(legacyImportBlockingReasons({
    duplicateCustomerAccounts: 2,
    duplicateActiveSubscriptionAccounts: 1,
    unknownSubscriptions: 3,
  }), [
    "2 account(s) match multiple Stripe customers",
    "1 account(s) have multiple active subscriptions",
    "3 subscription(s) have no Core/Max mapping",
  ]);
});

test("webhook claims retry failures and expired leases but not active workers", () => {
  const now = new Date("2026-08-27T20:10:00.000Z");
  assert.equal(webhookClaimDecision({
    processing_status: "processed",
    attempts: 1,
    processing_started_at: "2026-08-27T20:00:00.000Z",
  }, now), "processed");
  assert.equal(webhookClaimDecision({
    processing_status: "processing",
    attempts: 1,
    processing_started_at: "2026-08-27T20:09:00.000Z",
  }, now), "processing");
  assert.equal(webhookClaimDecision({
    processing_status: "processing",
    attempts: 1,
    processing_started_at: "2026-08-27T20:05:00.000Z",
  }, now), "reclaim");
  assert.equal(webhookClaimDecision({
    processing_status: "failed",
    attempts: 2,
    processing_started_at: "2026-08-27T20:09:30.000Z",
  }, now), "reclaim");
});

test("webhook audit payload keeps object identifiers and drops customer details", () => {
  const payload = webhookAuditPayload({
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        customer_details: { email: "student@example.com" },
      } as { id: string; object: string },
    },
  });
  assert.deepEqual(payload, {
    object_id: "cs_test_123",
    object_type: "checkout.session",
  });
  assert.equal(JSON.stringify(payload).includes("student@example.com"), false);
});
