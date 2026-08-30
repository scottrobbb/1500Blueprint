import { findBillingAccount } from "@/lib/billing/accounts";
import { cancelCheckoutIntent, findCurrentCheckoutReservation } from "@/lib/billing/checkout-intents";
import { billingBaseUrl, billingLivemode } from "@/lib/billing/config";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createCheckoutCancelCurrentPostHandler } from "./handler";

export const POST = createCheckoutCancelCurrentPostHandler({
  baseUrl: billingBaseUrl,
  getSession,
  findAccount: findBillingAccount,
  livemode: billingLivemode,
  consumeRateLimit,
  findCurrentReservation: findCurrentCheckoutReservation,
  cancelIntent: cancelCheckoutIntent,
  reportError: reportServerError,
});
