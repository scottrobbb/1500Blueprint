import assert from "node:assert/strict";
import test from "node:test";
import { resolveStoredPlan } from "./stored-plan";

function withPriceEnvironment(run: () => void) {
  const original = {
    max: process.env.STRIPE_MAX_PRICE_ID,
    legacyMax: process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS,
    fallback: process.env.STRIPE_LEGACY_FALLBACK_PLAN,
  };
  process.env.STRIPE_MAX_PRICE_ID = "price_max_current";
  process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS = "prod_old_max";
  process.env.STRIPE_LEGACY_FALLBACK_PLAN = "max";
  try {
    run();
  } finally {
    for (const [name, value] of [
      ["STRIPE_MAX_PRICE_ID", original.max],
      ["STRIPE_LEGACY_MAX_PRODUCT_IDS", original.legacyMax],
      ["STRIPE_LEGACY_FALLBACK_PLAN", original.fallback],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("stored plan codes and sentinels read back unchanged", () => {
  assert.equal(resolveStoredPlan("max"), "max");
  assert.equal(resolveStoredPlan("core"), "core");
  assert.equal(resolveStoredPlan("free"), "free");
  assert.equal(resolveStoredPlan("complimentary"), "max");
  assert.equal(resolveStoredPlan("testing"), "max");
  assert.equal(resolveStoredPlan(null), "free");
  assert.equal(resolveStoredPlan(""), "free");
});

test("a legacy row is repaired when its price or product is known", () => {
  withPriceEnvironment(() => {
    assert.equal(resolveStoredPlan("price_max_current"), "max");
    assert.equal(resolveStoredPlan("prod_old_max"), "max");
    assert.equal(resolveStoredPlan("Blueprint Max Annual"), "max");
  });
});

test("an unmappable stored plan never manufactures paid access", () => {
  // Regression: this used to return the paid fallback on the reasoning that
  // users.plan is only written once Stripe confirms an active subscription.
  // That holds when the row is written and not when it is read -- nothing
  // clears it when the subscription lapses, and legacy members have no
  // student_subscriptions rows for effectivePlan to prefer instead. Returning
  // a paid plan here granted Max to ~50 members who had stopped paying.
  withPriceEnvironment(() => {
    assert.equal(resolveStoredPlan("price_1UAJFJAPf1YLQmcsEmv3N2W0"), "free");
    assert.equal(resolveStoredPlan("prod_unknown"), "free");
    assert.equal(resolveStoredPlan("Starter"), "free");
  });
});

test("the fallback env var cannot re-enable paid access on the read path", () => {
  const original = process.env.STRIPE_LEGACY_FALLBACK_PLAN;
  process.env.STRIPE_LEGACY_FALLBACK_PLAN = "max";
  try {
    assert.equal(resolveStoredPlan("price_totally_unknown"), "free");
  } finally {
    if (original === undefined) delete process.env.STRIPE_LEGACY_FALLBACK_PLAN;
    else process.env.STRIPE_LEGACY_FALLBACK_PLAN = original;
  }
});
