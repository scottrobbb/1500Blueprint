import "server-only";

import type Stripe from "stripe";
import { billingOffer, type BillingCadence } from "./offers";
import { configuredPriceId, type BillablePlan } from "./config";
import { billingStripe } from "./stripe";

export async function resolveBillingPriceId(
  plan: BillablePlan,
  cadence: BillingCadence,
): Promise<string> {
  return resolveBillingPriceIdWithDeps(plan, cadence, {
    retrievePrice: (priceId) => billingStripe().prices.retrieve(priceId),
  });
}

export async function resolveBillingPriceIdWithDeps(
  plan: BillablePlan,
  cadence: BillingCadence,
  deps: { retrievePrice: (priceId: string) => Promise<Stripe.Price> },
): Promise<string> {
  const offer = billingOffer(plan, cadence);
  const price = await deps.retrievePrice(configuredPriceId(plan, cadence));

  if (priceMatchesOffer(price, offer.amount, offer.intervalCount)) {
    return price.id;
  }
  throw new Error(`The configured Stripe ${plan} ${cadence} price does not match the Blueprint offer`);
}

function priceMatchesOffer(
  price: Stripe.Price,
  amount: number,
  intervalCount: number,
): boolean {
  return price.active
    && price.currency === "usd"
    && price.unit_amount === amount
    && price.type === "recurring"
    && price.recurring?.interval === "month"
    && price.recurring.interval_count === intervalCount;
}
