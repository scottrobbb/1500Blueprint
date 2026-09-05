import { createHash } from "node:crypto";

export type ConversionContext = {
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  utm_medium: string | null;
  landing_page: string | null;
  event_source_url: string;
  client_ip_address: string | null;
  client_user_agent: string | null;
};

export type ConversionPayload = ConversionContext & {
  event_name: "CompleteRegistration" | "Purchase";
  event_id: string;
  event_time: number;
  action_source: "website";
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  external_id: string;
  conversion_kind: "registration" | "initial_purchase";
  content_name: string;
  value: number;
  currency: string;
};

export function registrationPayload(email: string, name: string, context: ConversionContext, now: Date): ConversionPayload {
  const identity = customerIdentity(email, name);
  return {
    ...context, ...identity,
    event_name: "CompleteRegistration",
    event_id: `registration:${identity.external_id}`,
    event_time: Math.floor(now.getTime() / 1000),
    action_source: "website",
    conversion_kind: "registration",
    content_name: "Blueprint account registration",
    value: 0,
    currency: "USD",
  };
}

export type PaidInvoice = {
  id: string;
  livemode: boolean;
  status: string | null;
  billing_reason: string | null;
  amount_paid: number;
  currency: string;
  status_transitions: { paid_at: number | null };
};

// Only a first, positive, collected subscription payment counts as acquisition.
// Renewal invoices, free trials, $0 coupons and manual "mark paid" do not.
export function purchasePayload(invoice: PaidInvoice, email: string, name: string, context: ConversionContext, collectedAmount: number): ConversionPayload | null {
  if (!invoice.livemode || invoice.status !== "paid"
    || invoice.billing_reason !== "subscription_create" || invoice.amount_paid <= 0
    || !Number.isSafeInteger(invoice.amount_paid) || invoice.currency !== "usd"
    || !Number.isSafeInteger(collectedAmount) || collectedAmount <= 0 || collectedAmount > invoice.amount_paid
    || !invoice.status_transitions.paid_at) return null;
  return {
    ...registrationPayload(email, name, context, new Date(invoice.status_transitions.paid_at * 1000)),
    event_name: "Purchase",
    event_id: `purchase:${invoice.id}`,
    conversion_kind: "initial_purchase",
    content_name: "Blueprint subscription",
    value: collectedAmount / 100,
    currency: "USD",
  };
}

function customerIdentity(email: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  const [first = "", ...rest] = normalizedName.split(/\s+/);
  return {
    name: normalizedName, first_name: first, last_name: rest.join(" "), email: normalizedEmail,
    external_id: createHash("sha256").update(`blueprint:${normalizedEmail}`).digest("hex"),
  };
}

export function retryAt(attempts: number, now: Date): string {
  return new Date(now.getTime() + Math.min(3600, 60 * 2 ** Math.min(attempts - 1, 6)) * 1000).toISOString();
}

export function isConversionExpired(eventTime: number, now: Date): boolean {
  return now.getTime() / 1000 - eventTime >= 6 * 24 * 60 * 60;
}
