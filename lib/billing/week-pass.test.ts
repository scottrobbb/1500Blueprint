import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { validateWeekPassPayment, weekPassIsActive, type WeekPassPayment } from "./week-pass-policy";
import { resolveBillingPriceIdWithDeps } from "./prices";

const paid: WeekPassPayment = {
  mode: "payment", status: "complete", payment_status: "paid", livemode: false,
  currency: "usd", amount_total: 3900, client_reference_id: "user-1",
  metadata: { platform: "1500_blueprint", user_id: "user-1", plan_code: "max", billing_cadence: "one_week" },
};

test("only a paid, matching-mode $39 Max pass qualifies for fulfillment", () => {
  assert.equal(validateWeekPassPayment(paid, false), "user-1");
  for (const change of [
    { mode: "subscription" }, { status: "open" }, { payment_status: "unpaid" },
    { payment_status: "no_payment_required" }, { livemode: true }, { currency: "eur" },
    { amount_total: 3800 }, { client_reference_id: "other" },
    { metadata: { ...paid.metadata, plan_code: "core" } },
    { metadata: { ...paid.metadata, billing_cadence: "monthly" } },
  ]) assert.throws(() => validateWeekPassPayment({ ...paid, ...change }, false));
});

test("weekly access starts inclusively, expires after exactly seven days and stops on refund", () => {
  const pass = { starts_at: "2026-09-22T12:00:00Z", expires_at: "2026-09-29T12:00:00Z", refunded_at: null };
  assert.equal(weekPassIsActive(pass, new Date("2026-09-22T11:59:59Z")), false);
  assert.equal(weekPassIsActive(pass, new Date(pass.starts_at)), true);
  assert.equal(weekPassIsActive(pass, new Date("2026-09-29T11:59:59Z")), true);
  assert.equal(weekPassIsActive(pass, new Date(pass.expires_at)), false);
  assert.equal(weekPassIsActive({ ...pass, refunded_at: pass.starts_at }, new Date(pass.starts_at)), false);
});

test("the weekly Price must be active, one-time, USD and exactly $39", async () => {
  const previous = process.env.STRIPE_MAX_WEEK_PRICE_ID;
  process.env.STRIPE_MAX_WEEK_PRICE_ID = "price_week";
  const price = { id: "price_week", active: true, currency: "usd", unit_amount: 3900, type: "one_time", recurring: null } as Stripe.Price;
  try {
    assert.equal(await resolveBillingPriceIdWithDeps("max", "one_week", { retrievePrice: async () => price }), "price_week");
    for (const change of [{ active: false }, { currency: "eur" }, { unit_amount: 390 }, { type: "recurring" as const }]) {
      await assert.rejects(resolveBillingPriceIdWithDeps("max", "one_week", { retrievePrice: async () => ({ ...price, ...change }) }));
    }
    await assert.rejects(resolveBillingPriceIdWithDeps("core", "one_week", { retrievePrice: async () => price }));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_MAX_WEEK_PRICE_ID;
    else process.env.STRIPE_MAX_WEEK_PRICE_ID = previous;
  }
});
