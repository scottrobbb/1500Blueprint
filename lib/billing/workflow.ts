import { readIdempotencyToken } from "@/lib/idempotency";
import type { BillablePlan } from "./config";
import { isBillablePlan } from "./config";
import type { BillingCadence } from "./offers";
import { isBillingCadence } from "./offers";

export const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1_000;

export type WebhookClaimRow = {
  processing_status: "processing" | "processed" | "failed";
  attempts: number;
  processing_started_at: string | null;
};

type SubscriptionIdentity = {
  userId: string;
  customerId: string;
  livemode: boolean;
};

export type CheckoutIntentClaim = {
  decision: "claimed" | "ready" | "busy";
  reservationId: string;
  checkoutExpiresAt: string;
  checkoutUrl: string | null;
  // The plan/cadence the reservation is actually for -- may differ from what
  // this request asked for when decision is "busy", which is how the checkout
  // route tells an abandoned reservation for a different plan apart from a
  // genuine same-plan double-submit still in flight.
  planCode: BillablePlan;
  billingCadence: BillingCadence;
};

export type LegacyImportAudit = {
  duplicateActiveSubscriptionAccounts: number;
  linkedCustomerMismatches: number;
  unknownSubscriptions: number;
};

export type LegacySubscriptionCandidate = {
  customerId: string;
  subscriptionId: string;
  status: string;
  created: number;
};

export type LegacyCustomerSelection = {
  customerId: string | null;
  activeSubscriptionCount: number;
  linkedCustomerMismatch: boolean;
};

const LEGACY_PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export function checkoutRequestToken(token: unknown): string | null {
  return readIdempotencyToken(token, { minLength: 16, maxLength: 100 });
}

export function stripeCheckoutIdempotencyKey(reservationId: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) {
    return null;
  }
  return `blueprint-checkout-${reservationId.toLowerCase()}`;
}

export function parseCheckoutIntentClaim(value: unknown): CheckoutIntentClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !["claimed", "ready", "busy"].includes(String(row.decision))
    || typeof row.reservation_id !== "string"
    || !stripeCheckoutIdempotencyKey(row.reservation_id)
    || typeof row.checkout_expires_at !== "string"
    || !Number.isFinite(Date.parse(row.checkout_expires_at))
    || !isBillablePlan(row.plan_code)
    || !isBillingCadence(row.billing_cadence)
  ) {
    return null;
  }
  const checkoutUrl = typeof row.stripe_checkout_session_url === "string"
    ? row.stripe_checkout_session_url
    : null;
  if (row.decision === "ready" && !isStripeCheckoutUrl(checkoutUrl)) return null;
  return {
    decision: row.decision as CheckoutIntentClaim["decision"],
    reservationId: row.reservation_id,
    checkoutExpiresAt: row.checkout_expires_at,
    checkoutUrl: row.decision === "ready" ? checkoutUrl : null,
    planCode: row.plan_code,
    billingCadence: row.billing_cadence,
  };
}

function isStripeCheckoutUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "checkout.stripe.com" || url.hostname.endsWith(".checkout.stripe.com"));
  } catch {
    return false;
  }
}

export function webhookClaimDecision(
  row: WebhookClaimRow,
  now: Date,
): "processed" | "processing" | "reclaim" {
  if (row.processing_status === "processed") return "processed";
  if (row.processing_status === "failed") return "reclaim";
  if (!row.processing_started_at) return "reclaim";
  const startedAt = Date.parse(row.processing_started_at);
  if (!Number.isFinite(startedAt)) return "reclaim";
  return now.getTime() - startedAt >= WEBHOOK_PROCESSING_LEASE_MS
    ? "reclaim"
    : "processing";
}

export function webhookAuditPayload(event: {
  data?: { object?: { id?: unknown; object?: unknown } };
}): { object_id?: string; object_type?: string } {
  const object = event.data?.object;
  return {
    ...(typeof object?.id === "string" && object.id.length <= 128
      ? { object_id: object.id }
      : {}),
    ...(typeof object?.object === "string" && object.object.length <= 64
      ? { object_type: object.object }
      : {}),
  };
}

export function subscriptionIdentityConflict(
  existing: SubscriptionIdentity | null,
  incoming: SubscriptionIdentity,
): "user" | "customer" | "mode" | null {
  if (!existing) return null;
  if (existing.userId !== incoming.userId) return "user";
  if (existing.customerId !== incoming.customerId) return "customer";
  if (existing.livemode !== incoming.livemode) return "mode";
  return null;
}

export function selectLegacyImportCustomer(
  candidates: LegacySubscriptionCandidate[],
  linkedCustomerId: string | null,
): LegacyCustomerSelection {
  const active = candidates.filter((candidate) => LEGACY_PAID_STATUSES.has(candidate.status));
  if (active.length > 1) {
    return {
      customerId: null,
      activeSubscriptionCount: active.length,
      linkedCustomerMismatch: false,
    };
  }

  const linkedCandidate = linkedCustomerId
    ? candidates.find((candidate) => candidate.customerId === linkedCustomerId)
    : null;
  const selected = active[0]
    ?? linkedCandidate
    ?? [...candidates].sort((a, b) => b.created - a.created)[0]
    ?? null;
  const customerId = selected?.customerId ?? null;

  return {
    customerId,
    activeSubscriptionCount: active.length,
    linkedCustomerMismatch: Boolean(
      linkedCustomerId
      && customerId
      && linkedCustomerId !== customerId,
    ),
  };
}

export function legacyImportBlockingReasons(audit: LegacyImportAudit): string[] {
  return [
    ...(audit.duplicateActiveSubscriptionAccounts > 0
      ? [`${audit.duplicateActiveSubscriptionAccounts} account(s) have multiple active subscriptions`]
      : []),
    ...(audit.linkedCustomerMismatches > 0
      ? [`${audit.linkedCustomerMismatches} account(s) are linked to a different Stripe customer`]
      : []),
    ...(audit.unknownSubscriptions > 0
      ? [`${audit.unknownSubscriptions} subscription(s) have no Core/Max mapping`]
      : []),
  ];
}
