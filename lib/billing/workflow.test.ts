import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutRequestToken,
  legacyImportBlockingReasons,
  parseCheckoutIntentClaim,
  selectLegacyImportCustomer,
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
    plan_code: "core",
    billing_cadence: "monthly",
  };
  assert.deepEqual(parseCheckoutIntentClaim(row), {
    decision: "ready",
    reservationId: row.reservation_id,
    checkoutExpiresAt: row.checkout_expires_at,
    checkoutUrl: row.stripe_checkout_session_url,
    planCode: "core",
    billingCadence: "monthly",
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
    planCode: "core",
    billingCadence: "monthly",
  });
  assert.equal(parseCheckoutIntentClaim({ ...row, plan_code: "not-a-plan" }), null);
  assert.equal(parseCheckoutIntentClaim({ ...row, billing_cadence: "yearly" }), null);
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
    duplicateActiveSubscriptionAccounts: 0,
    linkedCustomerMismatches: 0,
    unknownSubscriptions: 0,
  }), []);
  assert.deepEqual(legacyImportBlockingReasons({
    duplicateActiveSubscriptionAccounts: 1,
    linkedCustomerMismatches: 2,
    unknownSubscriptions: 3,
  }), [
    "1 account(s) have multiple active subscriptions",
    "2 account(s) are linked to a different Stripe customer",
    "3 subscription(s) have no Core/Max mapping",
  ]);
});

test("legacy import selects the only active subscription across duplicate customers", () => {
  assert.deepEqual(selectLegacyImportCustomer([
    { customerId: "cus_refunded", subscriptionId: "sub_refunded", status: "canceled", created: 20 },
    { customerId: "cus_starter", subscriptionId: "sub_starter", status: "active", created: 10 },
  ], null), {
    customerId: "cus_starter",
    activeSubscriptionCount: 1,
    linkedCustomerMismatch: false,
  });
});

test("legacy import blocks multiple active subscriptions and customer-link reassignment", () => {
  assert.deepEqual(selectLegacyImportCustomer([
    { customerId: "cus_one", subscriptionId: "sub_one", status: "active", created: 10 },
    { customerId: "cus_two", subscriptionId: "sub_two", status: "past_due", created: 20 },
  ], null), {
    customerId: null,
    activeSubscriptionCount: 2,
    linkedCustomerMismatch: false,
  });

  assert.deepEqual(selectLegacyImportCustomer([
    { customerId: "cus_current", subscriptionId: "sub_current", status: "canceled", created: 10 },
    { customerId: "cus_active", subscriptionId: "sub_active", status: "active", created: 20 },
  ], "cus_current"), {
    customerId: "cus_active",
    activeSubscriptionCount: 1,
    linkedCustomerMismatch: true,
  });
});

test("legacy import keeps the linked historical customer or otherwise chooses the newest", () => {
  const candidates = [
    { customerId: "cus_old", subscriptionId: "sub_old", status: "canceled", created: 10 },
    { customerId: "cus_new", subscriptionId: "sub_new", status: "canceled", created: 20 },
  ];
  assert.equal(selectLegacyImportCustomer(candidates, "cus_old").customerId, "cus_old");
  assert.equal(selectLegacyImportCustomer(candidates, null).customerId, "cus_new");
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
