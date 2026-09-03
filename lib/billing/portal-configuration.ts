import "server-only";

import type Stripe from "stripe";

import { billingStripe } from "./stripe";

// Cancellation is an in-app flow now, because it is the only place the one-time
// save offer can be put in front of a student. Stripe's hosted portal would
// happily cancel behind our back, so the portal is opened against a
// configuration of ours with subscription_cancel switched off. Everything else
// a student goes to the portal for -- cards, invoices, receipts, contact
// details -- stays on.
//
// Resolving this configuration is deliberately load-bearing: if it cannot be
// resolved the portal is not opened at all, since opening it against Stripe's
// default configuration is exactly the bypass this exists to close.

const CONFIGURATION_METADATA_KEY = "platform";
const CONFIGURATION_METADATA_VALUE = "1500_blueprint";
// Bump when the feature set below changes, so existing configurations are
// rewritten on the next portal open instead of silently keeping the old rules.
const CONFIGURATION_VERSION = "1";

let cachedConfigurationId: string | null = null;

const FEATURES: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: {
    enabled: true,
    allowed_updates: ["address", "email", "name", "phone", "tax_id"],
  },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  // The whole point. Cancelling goes through /api/billing/subscription/cancel.
  subscription_cancel: { enabled: false },
};

export async function billingPortalConfigurationId(): Promise<string> {
  const configured = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (configured) return configured;
  if (cachedConfigurationId) return cachedConfigurationId;

  const stripe = billingStripe();
  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const ours = existing.data.find(
    (configuration) =>
      configuration.metadata?.[CONFIGURATION_METADATA_KEY] === CONFIGURATION_METADATA_VALUE,
  );

  if (ours) {
    // An older generation of our own configuration, or one edited in the
    // Dashboard to re-enable cancelling, is rewritten back to these rules.
    if (
      ours.metadata?.config_version !== CONFIGURATION_VERSION
      || ours.features.subscription_cancel.enabled
    ) {
      const updated = await stripe.billingPortal.configurations.update(ours.id, {
        features: FEATURES,
        metadata: {
          [CONFIGURATION_METADATA_KEY]: CONFIGURATION_METADATA_VALUE,
          config_version: CONFIGURATION_VERSION,
        },
      });
      cachedConfigurationId = updated.id;
      return updated.id;
    }
    cachedConfigurationId = ours.id;
    return ours.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    features: FEATURES,
    metadata: {
      [CONFIGURATION_METADATA_KEY]: CONFIGURATION_METADATA_VALUE,
      config_version: CONFIGURATION_VERSION,
    },
  });
  cachedConfigurationId = created.id;
  return created.id;
}

// The only way the app opens Stripe's portal. Resolving the configuration first
// means a student can never be handed the default one, which still offers a
// cancel button; a failure here surfaces as "billing could not be opened"
// rather than as a silent bypass.
export async function openBillingPortal(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return billingStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    configuration: await billingPortalConfigurationId(),
  });
}
