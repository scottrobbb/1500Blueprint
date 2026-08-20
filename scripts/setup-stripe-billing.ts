import Stripe from "stripe";
import { setupStripeBilling } from "../lib/billing/setup";

const stripeKey = process.env.STRIPE_BILLING_KEY?.trim();
if (!stripeKey?.startsWith("rk_test_")) {
  throw new Error("A restricted Stripe sandbox key is required");
}

const stripe = new Stripe(stripeKey, { maxNetworkRetries: 2 });
async function main() {
  const configured = await setupStripeBilling(stripe);
  for (const [plan, values] of Object.entries(configured)) {
    console.log(`${plan.toUpperCase()}_PRODUCT_ID=${values.productId}`);
    console.log(`${plan.toUpperCase()}_PRICE_ID=${values.priceId}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stripe billing setup failed");
  process.exitCode = 1;
});
