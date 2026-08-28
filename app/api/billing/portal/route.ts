import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createPortalPostHandler } from "./handler";

export const POST = createPortalPostHandler({
  baseUrl: billingBaseUrl,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  createPortal: (customerId, returnUrl) => billingStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  }),
  reportError: reportServerError,
});
