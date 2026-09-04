import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPaidAccessStatus,
  PAYMENT_FAILURE_GRACE_DAYS,
  subscriptionGrantsAccess,
  isRefundEligible,
  pendingChangeHasTakenEffect,
  planChangeDirection,
  refundDeadline,
  scheduledCancellationAt,
} from "./policy";
import { billingCheckoutEnabled, planForLegacyProductId, planForPriceId, retentionCouponId } from "./config";
import { billingCadenceForInterval, billingOffer } from "./offers";

test("paid access includes Stripe retry grace but excludes terminal statuses", () => {
  assert.equal(hasPaidAccessStatus("active"), true);
  assert.equal(hasPaidAccessStatus("trialing"), true);
  assert.equal(hasPaidAccessStatus("past_due"), true);
  assert.equal(hasPaidAccessStatus("unpaid"), false);
  assert.equal(hasPaidAccessStatus("canceled"), false);
});

const DAY_MS = 24 * 60 * 60 * 1000;
const failedAt = new Date("2026-09-01T12:00:00.000Z");
const graceCloses = new Date(failedAt.getTime() + PAYMENT_FAILURE_GRACE_DAYS * DAY_MS);

test("a paid subscription grants access regardless of any recorded failure", () => {
  for (const status of ["active", "trialing"]) {
    assert.equal(
      subscriptionGrantsAccess({ status, paymentFailedAt: failedAt.toISOString() }, graceCloses),
      true,
      `${status} is paid; a stale failure stamp must not revoke it`,
    );
  }
});

test("a failed renewal keeps access through the grace window and loses it after", () => {
  const row = { status: "past_due", paymentFailedAt: failedAt.toISOString() };
  assert.equal(subscriptionGrantsAccess(row, failedAt), true);
  assert.equal(subscriptionGrantsAccess(row, new Date(graceCloses.getTime() - 1000)), true);
  assert.equal(subscriptionGrantsAccess(row, graceCloses), true, "the boundary itself is inclusive");
  assert.equal(subscriptionGrantsAccess(row, new Date(graceCloses.getTime() + 1000)), false);
  // The incident this closes: Stripe left the subscription past_due and access
  // continued for months.
  assert.equal(subscriptionGrantsAccess(row, new Date(failedAt.getTime() + 60 * DAY_MS)), false);
});

test("past_due with no usable failure stamp keeps the grace rather than revoking on a race", () => {
  assert.equal(subscriptionGrantsAccess({ status: "past_due", paymentFailedAt: null }, graceCloses), true);
  assert.equal(
    subscriptionGrantsAccess({ status: "past_due", paymentFailedAt: "not a date" }, graceCloses),
    true,
  );
});

test("terminal statuses never grant access, however recent", () => {
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(
      subscriptionGrantsAccess({ status, paymentFailedAt: null }, failedAt),
      false,
      `${status} must not grant access`,
    );
  }
});

test("plan changes use immediate upgrades and scheduled downgrades", () => {
  assert.equal(planChangeDirection("core", "max"), "upgrade");
  assert.equal(planChangeDirection("max", "core"), "downgrade");
  assert.equal(planChangeDirection("max", "max"), "same");
});

test("scheduled cancellations prefer Stripe cancel_at and preserve period-end compatibility", () => {
  assert.equal(scheduledCancellationAt({
    cancelAt: "2026-09-28T19:43:32.000Z",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-09-28T19:43:32.000Z",
  }), "2026-09-28T19:43:32.000Z");
  assert.equal(scheduledCancellationAt({
    cancelAt: null,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-09-28T19:43:32.000Z",
  }), "2026-09-28T19:43:32.000Z");
  assert.equal(scheduledCancellationAt({
    cancelAt: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-09-28T19:43:32.000Z",
  }), null);
});

test("same-plan cadence changes remain pending until both plan and cadence match", () => {
  assert.equal(pendingChangeHasTakenEffect({
    currentPlan: "max",
    currentCadence: "three_month",
    pendingPlan: "max",
    pendingCadence: "monthly",
  }), false);
  assert.equal(pendingChangeHasTakenEffect({
    currentPlan: "max",
    currentCadence: "monthly",
    pendingPlan: "max",
    pendingCadence: "monthly",
  }), true);
  assert.equal(pendingChangeHasTakenEffect({
    currentPlan: "core",
    currentCadence: "monthly",
    pendingPlan: "core",
    pendingCadence: null,
  }), true);
});

test("refund window is exactly 24 hours from the first purchase", () => {
  const purchased = new Date("2026-08-20T12:00:00.000Z");
  const deadline = refundDeadline(purchased, 24);
  assert.equal(deadline.toISOString(), "2026-08-21T12:00:00.000Z");
  assert.equal(isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: new Date("2026-08-21T12:00:00.000Z"),
  }), true);
  assert.equal(isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: new Date("2026-08-21T12:00:00.001Z"),
  }), false);
  assert.equal(isRefundEligible({
    isFirstSubscription: false,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: purchased,
  }), false);
});

test("billing checkout requires an explicit launch flag, mode, webhook, and every price", () => {
  const names = [
    "BILLING_ENABLED",
    "STRIPE_BILLING_MODE",
    "STRIPE_BILLING_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CORE_PRICE_ID",
    "STRIPE_CORE_THREE_MONTH_PRICE_ID",
    "STRIPE_MAX_PRICE_ID",
    "STRIPE_MAX_THREE_MONTH_PRICE_ID",
    "STRIPE_LEGACY_MAX_PRODUCT_IDS",
  ] as const;
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    names.forEach((name) => delete process.env[name]);
    assert.equal(billingCheckoutEnabled(), false);

    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_BILLING_MODE = "test";
    process.env.STRIPE_BILLING_KEY = "rk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    process.env.STRIPE_CORE_PRICE_ID = "price_core";
    process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID = "price_core_three_month";
    process.env.STRIPE_MAX_PRICE_ID = "price_max";
    process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID = "price_max_three_month";
    process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS = "prod_blueprint";
    assert.equal(billingCheckoutEnabled(), true);

    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(billingCheckoutEnabled(), false);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";

    process.env.STRIPE_BILLING_MODE = "preview";
    assert.equal(billingCheckoutEnabled(), false);
    process.env.STRIPE_BILLING_MODE = "live";
    assert.equal(billingCheckoutEnabled(), true);

    process.env.BILLING_ENABLED = "false";
    assert.equal(billingCheckoutEnabled(), false);
  } finally {
    names.forEach((name) => restoreEnvironmentVariable(name, original[name]));
  }
});

test("billing recognizes canonical prices and stable legacy products", () => {
  const original = {
    corePrice: process.env.STRIPE_CORE_PRICE_ID,
    coreThreeMonthPrice: process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID,
    maxPrice: process.env.STRIPE_MAX_PRICE_ID,
    maxThreeMonthPrice: process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID,
    legacyCoreProducts: process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS,
    legacyMaxProducts: process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS,
  };

  process.env.STRIPE_CORE_PRICE_ID = "price_core";
  process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID = "price_core_three_month";
  process.env.STRIPE_MAX_PRICE_ID = "price_max";
  process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID = "price_max_three_month";
  process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS = "prod_old_core";
  process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS = " prod_old_max, prod_older_max ";

  try {
    assert.equal(planForPriceId("price_core"), "core");
    assert.equal(planForPriceId("price_core_three_month"), "core");
    assert.equal(planForPriceId("price_max"), "max");
    assert.equal(planForPriceId("price_max_three_month"), "max");
    assert.equal(planForPriceId("price_unknown"), null);
    assert.equal(planForLegacyProductId("prod_old_core"), "core");
    assert.equal(planForLegacyProductId("prod_old_max"), "max");
    assert.equal(planForLegacyProductId("prod_older_max"), "max");
    assert.equal(planForLegacyProductId("prod_unknown"), null);
  } finally {
    restoreEnvironmentVariable("STRIPE_CORE_PRICE_ID", original.corePrice);
    restoreEnvironmentVariable("STRIPE_CORE_THREE_MONTH_PRICE_ID", original.coreThreeMonthPrice);
    restoreEnvironmentVariable("STRIPE_MAX_PRICE_ID", original.maxPrice);
    restoreEnvironmentVariable("STRIPE_MAX_THREE_MONTH_PRICE_ID", original.maxThreeMonthPrice);
    restoreEnvironmentVariable("STRIPE_LEGACY_CORE_PRODUCT_IDS", original.legacyCoreProducts);
    restoreEnvironmentVariable("STRIPE_LEGACY_MAX_PRODUCT_IDS", original.legacyMaxProducts);
  }
});

test("Core and Max offers use the requested one- and three-month prices", () => {
  assert.deepEqual(billingOffer("core", "monthly"), {
    plan: "core",
    cadence: "monthly",
    amount: 5_000,
    intervalCount: 1,
    label: "Core — 1 month",
  });
  assert.equal(billingOffer("core", "three_month").amount, 12_000);
  assert.equal(billingOffer("core", "three_month").intervalCount, 3);
  assert.equal(billingOffer("max", "monthly").amount, 8_000);
  assert.equal(billingOffer("max", "three_month").amount, 21_000);
  assert.equal(billingOffer("max", "three_month").intervalCount, 3);
  assert.equal(billingCadenceForInterval("month", 1), "monthly");
  assert.equal(billingCadenceForInterval("month", 3), "three_month");
});

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

// Stripe coupon ids do not cross billing modes, so the built-in live coupon is
// only ever handed to live mode. A test or preview environment names its own or
// gets nothing, which the retention flow reads as "make no offer".
test("the retention coupon is resolved per billing mode", () => {
  const original = process.env.STRIPE_RETENTION_COUPON_ID;
  try {
    delete process.env.STRIPE_RETENTION_COUPON_ID;
    assert.equal(retentionCouponId(false), null);
    assert.equal(typeof retentionCouponId(true), "string");

    process.env.STRIPE_RETENTION_COUPON_ID = "  test_coupon  ";
    assert.equal(retentionCouponId(false), "test_coupon");
    assert.equal(retentionCouponId(true), "test_coupon");

    process.env.STRIPE_RETENTION_COUPON_ID = "   ";
    assert.equal(retentionCouponId(false), null);
  } finally {
    if (original === undefined) delete process.env.STRIPE_RETENTION_COUPON_ID;
    else process.env.STRIPE_RETENTION_COUPON_ID = original;
  }
});
