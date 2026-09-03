import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl, billingCheckoutEnabled } from "@/lib/billing/config";
import { resumeSubscriptionForUser } from "@/lib/billing/retention";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createSubscriptionResumePostHandler } from "../handler";

export const POST = createSubscriptionResumePostHandler({
  baseUrl: billingBaseUrl,
  billingEnabled: billingCheckoutEnabled,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  resumeSubscription: resumeSubscriptionForUser,
  reportError: reportServerError,
});
