import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { resolveBillingPriceIdWithDeps } from "./prices";

test("runtime billing accepts only the explicitly configured matching Price", async () => {
  const original = process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID;
  process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID = "price_max_three_month";
  let retrieved: string | null = null;

  try {
    const priceId = await resolveBillingPriceIdWithDeps("max", "three_month", {
      retrievePrice: async (id) => {
        retrieved = id;
        return stripePrice(id, 21_000, 3);
      },
    });
    assert.equal(retrieved, "price_max_three_month");
    assert.equal(priceId, "price_max_three_month");

    await assert.rejects(
      resolveBillingPriceIdWithDeps("max", "three_month", {
        retrievePrice: async (id) => stripePrice(id, 8_000, 1),
      }),
      /does not match the Blueprint offer/,
    );
  } finally {
    if (original === undefined) delete process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID;
    else process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID = original;
  }
});

function stripePrice(id: string, unitAmount: number, intervalCount: number): Stripe.Price {
  return {
    id,
    active: true,
    currency: "usd",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: { interval: "month", interval_count: intervalCount },
  } as Stripe.Price;
}
