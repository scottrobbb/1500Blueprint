import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { setupStripeBilling } from "./setup";

test("Stripe setup creates Core but reuses the existing Blueprint product for Max", async () => {
  const createdProducts: string[] = [];
  const createdPrices: Array<{ product: string; amount: number; intervalCount: number }> = [];
  const coreProduct = stripeProduct("prod_core", "1500 SAT Blueprint Core", {
    platform: "1500_blueprint",
    plan_code: "core",
  });
  const maxProduct = stripeProduct("prod_blueprint", "1500 SAT Blueprint", {});
  const maxMonthly = stripePrice("price_blueprint_monthly", "prod_blueprint", 8_000, 1);

  const stripe = {
    products: {
      list: async () => ({ data: [] }),
      create: async (input: Stripe.ProductCreateParams) => {
        createdProducts.push(input.name);
        return coreProduct;
      },
      retrieve: async (id: string) => {
        assert.equal(id, maxProduct.id);
        return maxProduct;
      },
    },
    prices: {
      retrieve: async (id: string) => {
        assert.equal(id, maxMonthly.id);
        return maxMonthly;
      },
      list: async ({ product }: Stripe.PriceListParams) => ({
        data: product === maxProduct.id ? [maxMonthly] : [],
      }),
      create: async (input: Stripe.PriceCreateParams) => {
        const intervalCount = input.recurring?.interval_count ?? 1;
        createdPrices.push({
          product: String(input.product),
          amount: input.unit_amount ?? 0,
          intervalCount,
        });
        return stripePrice(
          `price_${String(input.product)}_${intervalCount}`,
          String(input.product),
          input.unit_amount ?? 0,
          intervalCount,
        );
      },
    },
  } as unknown as Stripe;

  const configured = await setupStripeBilling(stripe, {
    maxAnchorPriceId: maxMonthly.id,
  });

  assert.deepEqual(createdProducts, ["1500 SAT Blueprint Core"]);
  assert.equal(configured.max.productId, maxProduct.id);
  assert.equal(configured.max.prices.monthly, maxMonthly.id);
  assert.deepEqual(createdPrices, [
    { product: coreProduct.id, amount: 5_000, intervalCount: 1 },
    { product: coreProduct.id, amount: 12_000, intervalCount: 3 },
    { product: maxProduct.id, amount: 21_000, intervalCount: 3 },
  ]);
});

test("Stripe setup validates the existing Blueprint product before creating Core", async () => {
  let productCreates = 0;
  const stripe = {
    products: {
      list: async () => ({ data: [] }),
      retrieve: async () => ({
        ...stripeProduct("prod_inactive", "Old Blueprint", {}),
        active: false,
      }),
      create: async () => {
        productCreates += 1;
        return stripeProduct("prod_core", "Core", {});
      },
    },
    prices: {
      retrieve: async () => ({
        ...stripePrice("price_old", "prod_inactive", 8_000, 1),
        product: "prod_inactive",
      }),
    },
  } as unknown as Stripe;

  await assert.rejects(
    setupStripeBilling(stripe, { maxAnchorPriceId: "price_old" }),
    /existing Blueprint product is not active/,
  );
  assert.equal(productCreates, 0);
});

function stripeProduct(id: string, name: string, metadata: Record<string, string>): Stripe.Product {
  return { id, name, metadata, active: true } as Stripe.Product;
}

function stripePrice(
  id: string,
  product: string,
  unitAmount: number,
  intervalCount: number,
): Stripe.Price {
  return {
    id,
    product,
    active: true,
    currency: "usd",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: { interval: "month", interval_count: intervalCount },
  } as Stripe.Price;
}
