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
// resolved -- or resolves to one that still allows cancelling -- the portal is
// not opened at all, since opening it against Stripe's default configuration is
// exactly the bypass this exists to close.

const CONFIGURATION_METADATA_KEY = "platform";
const CONFIGURATION_METADATA_VALUE = "1500_blueprint";
// Bump when the feature set below changes, so existing configurations are
// rewritten on the next portal open instead of silently keeping the old rules.
const CONFIGURATION_VERSION = "1";
// The cache is what keeps the portal from re-resolving on every open, but a
// configuration edited in the Dashboard to switch cancelling back on must not
// stay trusted for the life of a warm instance, so the answer expires.
const CACHE_TTL_MS = 5 * 60 * 1000;


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

type PortalConfiguration = {
  id: string;
  metadata: Stripe.Metadata | null;
  features: { subscription_cancel: { enabled: boolean } };
};

export type PortalConfigurationDeps = {
  now: () => number;
  configuredId: () => string | undefined;
  retrieve: (id: string) => Promise<PortalConfiguration>;
  list: () => Promise<PortalConfiguration[]>;
  update: (id: string) => Promise<PortalConfiguration>;
  create: () => Promise<PortalConfiguration>;
};

export async function resolvePortalConfigurationId(
  deps: PortalConfigurationDeps,
  cache: { current: { id: string; verifiedAt: number } | null },
): Promise<string> {
  const now = deps.now();
  if (cache.current && now - cache.current.verifiedAt < CACHE_TTL_MS) return cache.current.id;

  // A configuration named by env is still only trusted once it has been read
  // back and shown to have cancelling switched off. Naming the wrong one -- or
  // Stripe's default -- would otherwise reopen the exact bypass this closes,
  // and it would do so silently.
  const configured = deps.configuredId()?.trim();
  if (configured) {
    const configuration = await deps.retrieve(configured);
    if (configuration.features.subscription_cancel.enabled) {
      throw new Error(
        `Stripe portal configuration ${configured} allows cancelling; refusing to open the portal against it`,
      );
    }
    cache.current = { id: configuration.id, verifiedAt: now };
    return configuration.id;
  }

  const ours = (await deps.list()).find(
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
      const updated = await deps.update(ours.id);
      cache.current = { id: updated.id, verifiedAt: now };
      return updated.id;
    }
    cache.current = { id: ours.id, verifiedAt: now };
    return ours.id;
  }

  const created = await deps.create();
  cache.current = { id: created.id, verifiedAt: now };
  return created.id;
}

const cache: { current: { id: string; verifiedAt: number } | null } = { current: null };

const CONFIGURATION_METADATA: Stripe.MetadataParam = {
  [CONFIGURATION_METADATA_KEY]: CONFIGURATION_METADATA_VALUE,
  config_version: CONFIGURATION_VERSION,
};

export async function billingPortalConfigurationId(): Promise<string> {
  const stripe = billingStripe();
  return resolvePortalConfigurationId({
    now: Date.now,
    configuredId: () => process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    retrieve: (id) => stripe.billingPortal.configurations.retrieve(id),
    list: async () => (await stripe.billingPortal.configurations.list({ limit: 100 })).data,
    update: (id) => stripe.billingPortal.configurations.update(id, {
      features: FEATURES,
      metadata: CONFIGURATION_METADATA,
    }),
    create: () => stripe.billingPortal.configurations.create({
      features: FEATURES,
      metadata: CONFIGURATION_METADATA,
    }),
  }, cache);
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
