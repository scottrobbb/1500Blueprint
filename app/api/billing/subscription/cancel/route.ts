import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl, billingCheckoutEnabled } from "@/lib/billing/config";
import { cancelSubscriptionForUser } from "@/lib/billing/retention";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createSubscriptionCancelPostHandler } from "../handler";

export const POST = createSubscriptionCancelPostHandler({
  baseUrl: billingBaseUrl,
  billingEnabled: billingCheckoutEnabled,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  cancelSubscription: cancelSubscriptionForUser,
  reportError: reportServerError,
});
