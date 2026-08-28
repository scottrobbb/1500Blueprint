import type Stripe from "stripe";
import { findBillingAccount, ensureStripeCustomer, hasUntrackedStripeBilling } from "@/lib/billing/accounts";
import { changeBillingPlan } from "@/lib/billing/changes";
import { billingBaseUrl, billingCheckoutEnabled, billingLivemode } from "@/lib/billing/config";
import { resolveBillingPriceId } from "@/lib/billing/prices";
import { billingStripe } from "@/lib/billing/stripe";
import { claimCheckoutIntent, storeCheckoutSession } from "@/lib/billing/checkout-intents";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { createCheckoutPostHandler } from "./handler";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";

export const POST = createCheckoutPostHandler({
  baseUrl: billingBaseUrl,
  billingEnabled: billingCheckoutEnabled,
  livemode: billingLivemode,
  now: Date.now,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  findSubscriptionState,
  hasUntrackedBilling: hasUntrackedStripeBilling,
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

async function findSubscriptionState(userId: string, livemode: boolean) {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("stripe_customer_id,status")
    .eq("user_id", userId)
    .eq("livemode", livemode)
    .order("updated_at", { ascending: false })
    .returns<Array<{ stripe_customer_id: string; status: string }>>();
  if (error) throw new Error(`failed to check current subscription: ${error.message}`);
  const activeStatuses = new Set<string>(PAID_ACCESS_STATUSES);
  const active = (data ?? []).find((row) => activeStatuses.has(row.status));
  return {
    activeCustomerId: active?.stripe_customer_id ?? null,
    trackedCustomerId: data?.[0]?.stripe_customer_id ?? null,
    hasTrackedSubscriptions: Boolean(data?.length),
  };
}
