import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedCron } from "@/lib/security/cron";
import { registrationPayload, purchasePayload, retryAt, isConversionExpired, type ConversionContext, type PaidInvoice } from "./conversions";

const now = new Date("2026-09-05T00:00:00Z");
const context: ConversionContext = {
  fbclid: "click", fbc: "fb.1.1788500000000.click", fbp: null, utm_medium: "paid_social",
  landing_page: "/free", event_source_url: "https://1500blueprint.com/account/sign-up",
  client_ip_address: null, client_user_agent: "test-browser",
};
const invoice: PaidInvoice = {
  id: "in_test", livemode: true, status: "paid", billing_reason: "subscription_create",
  amount_paid: 3750, currency: "usd", status_transitions: { paid_at: now.getTime() / 1000 },
};

test("registration identity is stable across duplicate forms and normalized emails", () => {
  const first = registrationPayload(" Student@Example.com ", "Mary Jane Watson", context, now);
  const retry = registrationPayload("student@example.com", "Mary Jane Watson", context, new Date(now.getTime() + 5000));
  assert.equal(first.event_id, retry.event_id);
  assert.equal(first.event_time, 1788566400);
  assert.equal(first.first_name, "Mary");
  assert.equal(first.last_name, "Jane Watson");
  assert.equal(first.fbc, context.fbc);
  assert.equal(first.value, 0);
  assert.equal(first.event_name, "CompleteRegistration");
});

test("direct registrations carry no invented ad click", () => {
  const payload = registrationPayload("direct@example.com", "Alex", { ...context, fbclid: null, fbc: null, utm_medium: null, landing_page: null }, now);
  assert.equal(payload.fbc, null);
  assert.equal(payload.last_name, "");
  assert.equal(payload.event_name, "CompleteRegistration");
});

test("purchase uses collected value after discounts and the original paid timestamp", () => {
  const payload = purchasePayload(invoice, "student@example.com", "Student", context, 3750);
  assert.equal(payload?.value, 37.5);
  assert.equal(payload?.currency, "USD");
  assert.equal(payload?.event_id, "purchase:in_test");
  assert.equal(payload?.event_time, invoice.status_transitions.paid_at);
  assert.equal(payload?.conversion_kind, "initial_purchase");
});

test("test mode, renewals, upgrades, unpaid and zero-dollar invoices are not acquisition", () => {
  const excluded: Partial<PaidInvoice>[] = [
    { livemode: false }, { status: "open" }, { amount_paid: 0 }, { amount_paid: -1 },
    { billing_reason: "subscription_cycle" }, { billing_reason: "subscription_update" },
    { currency: "jpy" }, { status_transitions: { paid_at: null } },
  ];
  for (const change of excluded) assert.equal(purchasePayload({ ...invoice, ...change }, "student@example.com", "Student", context, 3750), null);
});

test("manual paid invoices without collected Stripe payments do not convert; credits do not inflate value", () => {
  assert.equal(purchasePayload(invoice, "student@example.com", "Student", context, 0), null);
  assert.equal(purchasePayload(invoice, "student@example.com", "Student", context, 4000), null);
  assert.equal(purchasePayload(invoice, "student@example.com", "Student", context, 2500)?.value, 25);
});

test("retries back off and old conversions expire before Meta's seven-day window", () => {
  assert.equal(retryAt(1, now), "2026-09-05T00:01:00.000Z");
  assert.equal(retryAt(20, now), "2026-09-05T01:00:00.000Z");
  assert.equal(isConversionExpired(now.getTime() / 1000 - 6 * 86400, now), true);
  assert.equal(isConversionExpired(now.getTime() / 1000, now), false);
});

test("cron rejects missing, weak, malformed and incorrect authorization", () => {
  const secret = "a".repeat(48);
  assert.equal(isAuthorizedCron(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedCron(null, secret), false);
  assert.equal(isAuthorizedCron(`Bearer ${secret}`, undefined), false);
  assert.equal(isAuthorizedCron("Bearer short", "short"), false);
  assert.equal(isAuthorizedCron(`Bearer ${"b".repeat(48)}`, secret), false);
});
