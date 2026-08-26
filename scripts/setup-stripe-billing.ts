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
    console.log(`STRIPE_${plan.toUpperCase()}_PRODUCT_ID=${values.productId}`);
    for (const [cadence, priceId] of Object.entries(values.prices)) {
      const variable = cadence === "three_month"
        ? `STRIPE_${plan.toUpperCase()}_THREE_MONTH_PRICE_ID`
        : `STRIPE_${plan.toUpperCase()}_PRICE_ID`;
      console.log(`${variable}=${priceId}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stripe billing setup failed");
  process.exitCode = 1;
});
