import type Stripe from "stripe";
import { findBillingAccount, ensureStripeCustomer } from "@/lib/billing/accounts";
import { changeBillingPlan } from "@/lib/billing/changes";
import { billingBaseUrl, billingLivemode } from "@/lib/billing/config";
import { resolveBillingPriceId } from "@/lib/billing/prices";
import { billingStripe } from "@/lib/billing/stripe";
import { claimCheckoutIntent, storeCheckoutSession } from "@/lib/billing/checkout-intents";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { createCheckoutPostHandler } from "./handler";

export const POST = createCheckoutPostHandler({
  baseUrl: billingBaseUrl,
  livemode: billingLivemode,
  now: Date.now,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  findActiveSubscriptionCustomer,
  changePlan: changeBillingPlan,
  createPortal: async (customerId, returnUrl) => billingStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  }),
  claimIntent: claimCheckoutIntent,
  ensureCustomer: ensureStripeCustomer,
  resolvePrice: resolveBillingPriceId,
  createCheckout: async (params, idempotencyKey) => billingStripe().checkout.sessions.create(
    params as Stripe.Checkout.SessionCreateParams,
    { idempotencyKey },
  ),
  storeCheckout: storeCheckoutSession,
  reportError: reportServerError,
});

async function findActiveSubscriptionCustomer(userId: string, livemode: boolean): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .eq("livemode", livemode)
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ stripe_customer_id: string }>();
  if (error) throw new Error(`failed to check current subscription: ${error.message}`);
  return data?.stripe_customer_id ?? null;
}
