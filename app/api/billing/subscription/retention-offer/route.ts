import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl, billingCheckoutEnabled } from "@/lib/billing/config";
import { acceptRetentionOfferForUser } from "@/lib/billing/retention";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createRetentionOfferPostHandler } from "../handler";

export const POST = createRetentionOfferPostHandler({
  baseUrl: billingBaseUrl,
  billingEnabled: billingCheckoutEnabled,
  getSession,
  findAccount: findBillingAccount,
  consumeRateLimit,
  acceptOffer: acceptRetentionOfferForUser,
  reportError: reportServerError,
});
