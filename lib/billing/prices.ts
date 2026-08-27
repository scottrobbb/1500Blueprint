import "server-only";

import type Stripe from "stripe";
import { billingOffer, type BillingCadence } from "./offers";
import { configuredPriceId, type BillablePlan } from "./config";
import { billingStripe } from "./stripe";

export async function resolveBillingPriceId(
  plan: BillablePlan,
  cadence: BillingCadence,
): Promise<string> {
  const stripe = billingStripe();
  const offer = billingOffer(plan, cadence);
  const anchorPrice = await retrieveAnchorPrice(stripe, plan, cadence);

  if (priceMatchesOffer(anchorPrice, offer.amount, offer.intervalCount)) {
    return anchorPrice.id;
  }

  const productId = stripeId(anchorPrice.product);
  if (!productId) throw new Error(`The configured ${plan} price has no Stripe product`);

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
    limit: 100,
  });
  const existing = prices.data.find((price) =>
    priceMatchesOffer(price, offer.amount, offer.intervalCount),
  );
  if (existing) return existing.id;

  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: offer.amount,
      recurring: { interval: "month", interval_count: offer.intervalCount },
      lookup_key: `blueprint_${plan}_${cadence}_${offer.amount}`,
      nickname: offer.label,
      metadata: {
        platform: "1500_blueprint",
        plan_code: plan,
        billing_cadence: cadence,
      },
    },
    { idempotencyKey: `blueprint-${plan}-${cadence}-${offer.amount}-price-v1` },
  );
  return price.id;
}

async function retrieveAnchorPrice(
  stripe: Stripe,
  plan: BillablePlan,
  cadence: BillingCadence,
): Promise<Stripe.Price> {
  try {
    return await stripe.prices.retrieve(configuredPriceId(plan, cadence));
  } catch (error) {
    if (cadence !== "three_month") throw error;
    return stripe.prices.retrieve(configuredPriceId(plan, "monthly"));
  }
}

function priceMatchesOffer(price: Stripe.Price, amount: number, intervalCount: number): boolean {
  return price.active
    && price.currency === "usd"
    && price.unit_amount === amount
    && price.type === "recurring"
    && price.recurring?.interval === "month"
    && price.recurring.interval_count === intervalCount;
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
