import { findBillingAccount } from "@/lib/billing/accounts";
import { cancelCheckoutIntent } from "@/lib/billing/checkout-intents";
import { billingBaseUrl, billingLivemode } from "@/lib/billing/config";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { createCheckoutCancelGetHandler } from "./handler";

export const GET = createCheckoutCancelGetHandler({
  baseUrl: billingBaseUrl,
  getSession,
  findAccount: findBillingAccount,
  livemode: billingLivemode,
  cancelIntent: cancelCheckoutIntent,
  reportError: reportServerError,
});
