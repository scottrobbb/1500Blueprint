import type Stripe from "stripe";
import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { markCheckoutSession } from "@/lib/billing/checkout-intents";
import { syncStripeSubscription } from "@/lib/billing/subscriptions";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { createConfirmGetHandler } from "./handler";

export const GET = createConfirmGetHandler({
  baseUrl: billingBaseUrl,
  getSession,
  findAccount: findBillingAccount,
  retrieveCheckout: (checkoutId) => billingStripe().checkout.sessions.retrieve(checkoutId),
  retrieveSubscription: (subscriptionId) => billingStripe().subscriptions.retrieve(subscriptionId),
  syncSubscription: (subscription, accountId) => syncStripeSubscription(
    subscription as Stripe.Subscription,
    accountId,
  ),
  markCheckout: markCheckoutSession,
  reportError: reportServerError,
});
