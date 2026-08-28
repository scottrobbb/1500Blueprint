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
      {
        cadence: "three_month",
        amount: 21_000,
        intervalCount: 3,
        lookupKey: "blueprint_max_three_month_21000",
      },
    ],
  },
] as const;

export async function setupStripeBilling(
  stripe: Stripe,
  options: { maxAnchorPriceId: string },
) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const maxProduct = await existingMaxProduct(stripe, options.maxAnchorPriceId);
  const coreProduct = await findOrCreateCoreProduct(stripe, products.data, maxProduct.id);
  const productByPlan = { core: coreProduct, max: maxProduct } as const;
  const configured: Record<string, { productId: string; prices: Record<string, string> }> = {};

  for (const plan of plans) {
    const product = productByPlan[plan.code];

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

async function findOrCreateCoreProduct(
  stripe: Stripe,
  products: Stripe.Product[],
  maxProductId: string,
): Promise<Stripe.Product> {
  const existing = products.find(
    (item) => item.metadata.platform === "1500_blueprint" && item.metadata.plan_code === "core",
  );
  if (existing) {
    if (existing.id === maxProductId) throw new Error("Core and Max cannot use the same Stripe product");
    return existing;
  }
  const plan = plans[0];
  return stripe.products.create(
    {
      name: plan.name,
      description: plan.description,
      metadata: { platform: "1500_blueprint", plan_code: plan.code },
    },
    { idempotencyKey: "1500-blueprint-core-product-v1" },
  );
}

async function existingMaxProduct(
  stripe: Stripe,
  anchorPriceId: string,
): Promise<Stripe.Product> {
  if (!anchorPriceId.startsWith("price_")) {
    throw new Error("STRIPE_MAX_PRICE_ID must identify the existing Blueprint price");
  }
  const anchor = await stripe.prices.retrieve(anchorPriceId);
  const productId = stripeId(anchor.product);
  if (!productId) throw new Error("The existing Blueprint price has no Stripe product");

  const product = await stripe.products.retrieve(productId);
  if (!product.active) throw new Error("The existing Blueprint product is not active");
  if (product.metadata.plan_code === "core") {
    throw new Error("The existing Blueprint product is already marked as Core");
  }
  return product;
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
