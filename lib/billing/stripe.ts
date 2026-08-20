import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function billingStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_BILLING_KEY?.trim();
    if (!key) throw new Error("STRIPE_BILLING_KEY is not configured");
    stripeClient = new Stripe(key, {
      appInfo: { name: "1500 SAT Blueprint", version: "1.0.0" },
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}
