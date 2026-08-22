import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPaidAccessStatus,
  isRefundEligible,
  planChangeDirection,
  refundDeadline,
} from "./policy";
import { planForLegacyProductId, planForPriceId } from "./config";

test("paid access includes Stripe retry grace but excludes terminal statuses", () => {
  assert.equal(hasPaidAccessStatus("active"), true);
  assert.equal(hasPaidAccessStatus("trialing"), true);
  assert.equal(hasPaidAccessStatus("past_due"), true);
  assert.equal(hasPaidAccessStatus("unpaid"), false);
  assert.equal(hasPaidAccessStatus("canceled"), false);
});

test("plan changes use immediate upgrades and scheduled downgrades", () => {
  assert.equal(planChangeDirection("core", "max"), "upgrade");
  assert.equal(planChangeDirection("max", "core"), "downgrade");
  assert.equal(planChangeDirection("max", "max"), "same");
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

test("billing recognizes canonical prices and stable legacy products", () => {
  const original = {
    corePrice: process.env.STRIPE_CORE_PRICE_ID,
    maxPrice: process.env.STRIPE_MAX_PRICE_ID,
    legacyCoreProducts: process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS,
    legacyMaxProducts: process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS,
  };

  process.env.STRIPE_CORE_PRICE_ID = "price_core";
  process.env.STRIPE_MAX_PRICE_ID = "price_max";
  process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS = "prod_old_core";
  process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS = " prod_old_max, prod_older_max ";

  try {
    assert.equal(planForPriceId("price_core"), "core");
    assert.equal(planForPriceId("price_max"), "max");
    assert.equal(planForPriceId("price_unknown"), null);
    assert.equal(planForLegacyProductId("prod_old_core"), "core");
    assert.equal(planForLegacyProductId("prod_old_max"), "max");
    assert.equal(planForLegacyProductId("prod_older_max"), "max");
    assert.equal(planForLegacyProductId("prod_unknown"), null);
  } finally {
    restoreEnvironmentVariable("STRIPE_CORE_PRICE_ID", original.corePrice);
    restoreEnvironmentVariable("STRIPE_MAX_PRICE_ID", original.maxPrice);
    restoreEnvironmentVariable("STRIPE_LEGACY_CORE_PRODUCT_IDS", original.legacyCoreProducts);
    restoreEnvironmentVariable("STRIPE_LEGACY_MAX_PRODUCT_IDS", original.legacyMaxProducts);
  }
});

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
