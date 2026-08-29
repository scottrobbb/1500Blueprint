import type Stripe from "stripe";

const plans = [
  {
    code: "core",
    name: "1500 Blueprint Core",
    description: "Structured SAT practice with the complete Core question library.",
    prices: [
      {
        cadence: "monthly",
        amount: 5_000,
        intervalCount: 1,
        lookupKey: "blueprint_core_monthly_5000",
      },
      {
        cadence: "three_month",
        amount: 12_000,
        intervalCount: 3,
        lookupKey: "blueprint_core_three_month_12000",
      },
    ],
  },
  {
    code: "max",
    name: "1500 Blueprint Max",
    description: "Scott's complete SAT system with every test, course, and live support.",
    prices: [
      {
        cadence: "monthly",
        amount: 8_000,
        intervalCount: 1,
        lookupKey: "blueprint_max_monthly_8000",
      },
    ],
  },
] as const;

export async function setupStripeBilling(stripe: Stripe) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const configured: Record<string, { productId: string; prices: Record<string, string> }> = {};

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

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "recurring",
      limit: 100,
    });
    const configuredPrices: Record<string, string> = {};

    for (const offer of plan.prices) {
      let price = prices.data.find(
        (item) => item.unit_amount === offer.amount
          && item.currency === "usd"
          && item.recurring?.interval === "month"
          && item.recurring.interval_count === offer.intervalCount,
      );
      if (!price) {
        price = await stripe.prices.create(
          {
            product: product.id,
            currency: "usd",
            unit_amount: offer.amount,
            recurring: { interval: "month", interval_count: offer.intervalCount },
            lookup_key: offer.lookupKey,
            nickname: `${plan.name} — ${offer.intervalCount} month`,
            metadata: {
              platform: "1500_blueprint",
              plan_code: plan.code,
              billing_cadence: offer.cadence,
            },
          },
          {
            idempotencyKey:
              `1500-blueprint-${plan.code}-${offer.cadence}-${offer.amount}-price-v1`,
          },
        );
      }
      configuredPrices[offer.cadence] = price.id;
    }
    configured[plan.code] = { productId: product.id, prices: configuredPrices };
  }

  return configured;
}
