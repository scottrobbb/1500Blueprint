import type Stripe from "stripe";

const plans = [
  {
    code: "core",
    name: "1500 SAT Blueprint Core",
    amount: 3900,
    lookupKey: "blueprint_core_monthly",
    description: "Structured SAT practice with the complete Core question library.",
  },
  {
    code: "max",
    name: "1500 SAT Blueprint Max",
    amount: 8000,
    lookupKey: "blueprint_max_monthly",
    description: "Scott's complete SAT system with every test, course, and live support.",
  },
] as const;

export async function setupStripeBilling(stripe: Stripe) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const configured: Record<string, { productId: string; priceId: string }> = {};

  for (const plan of plans) {
    let product = products.data.find(
      (item) => item.metadata.platform === "1500_blueprint" && item.metadata.plan_code === plan.code,
    );
    if (!product) {
      product = await stripe.products.create(
        {
          name: plan.name,
          description: plan.description,
          metadata: { platform: "1500_blueprint", plan_code: plan.code },
        },
        { idempotencyKey: `1500-blueprint-${plan.code}-product-v1` },
      );
    }

    const prices = await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 });
    let price = prices.data.find(
      (item) => item.unit_amount === plan.amount
        && item.currency === "usd"
        && item.recurring?.interval === "month",
    );
    if (!price) {
      price = await stripe.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount: plan.amount,
          recurring: { interval: "month" },
          lookup_key: plan.lookupKey,
          metadata: { platform: "1500_blueprint", plan_code: plan.code },
        },
        { idempotencyKey: `1500-blueprint-${plan.code}-monthly-price-v1` },
      );
    }
    configured[plan.code] = { productId: product.id, priceId: price.id };
  }

  return configured;
}
