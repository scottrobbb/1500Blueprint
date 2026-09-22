import "server-only";

import type Stripe from "stripe";
import { billingOffer, WEEK_PASS_AMOUNT, type CheckoutTerm } from "./offers";
import { configuredPriceId, type BillablePlan } from "./config";
import { billingStripe } from "./stripe";

export async function resolveBillingPriceId(
  plan: BillablePlan,
  cadence: CheckoutTerm,
): Promise<string> {
  return resolveBillingPriceIdWithDeps(plan, cadence, {
    retrievePrice: (priceId) => billingStripe().prices.retrieve(priceId),
  });
}

export async function resolveBillingPriceIdWithDeps(
  plan: BillablePlan,
  cadence: CheckoutTerm,
  deps: { retrievePrice: (priceId: string) => Promise<Stripe.Price> },
): Promise<string> {
  if (cadence === "one_week") {
    const priceId = process.env.STRIPE_MAX_WEEK_PRICE_ID?.trim();
    if (plan !== "max" || !priceId) throw new Error("The one-week Max price is not configured");
    const price = await deps.retrievePrice(priceId);
    if (!price.active || price.currency !== "usd" || price.unit_amount !== WEEK_PASS_AMOUNT
      || price.type !== "one_time" || price.recurring) {
      throw new Error("The configured one-week Price must be a one-time $39 USD payment");
    }
    return price.id;
  }
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
