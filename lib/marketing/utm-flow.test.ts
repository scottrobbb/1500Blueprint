import assert from "node:assert/strict";
import test from "node:test";
import { hasAttributionParams, mergeAttribution, parseAttributionCookie, readAttributionParams, serializeAttribution, UTM_KEYS } from "./attribution";
import { registrationPayload, purchasePayload, type ConversionContext } from "./conversions";

const now = new Date("2026-09-25T00:00:00Z");
const utms = {
  utm_source: "facebook",
  utm_medium: "paid_social",
  utm_campaign: "Fall SAT prep",
  utm_content: "video A / parent",
  utm_term: "1500+ score",
};

test("all five UTM fields survive landing, cookie, return visit, registration and purchase", () => {
  const landing = readAttributionParams(new URLSearchParams({ ...utms, fbclid: "ad-click" }), now.getTime());
  const stored = parseAttributionCookie(serializeAttribution(landing));
  assert.ok(stored);
  const revisited = mergeAttribution(stored, readAttributionParams(new URLSearchParams(), now.getTime() + 1000), now.getTime() + 1000);
  const context: ConversionContext = {
    ...revisited.attribution, fbp: null, landing_page: "/free",
    event_source_url: "https://1500blueprint.com/account/sign-up", client_ip_address: null, client_user_agent: "test",
  };
  const signup = registrationPayload("student@example.com", "Student", context, now);
  // Mirrors the JSON context persisted at signup/checkout for Stripe's later callback.
  const savedContext = JSON.parse(JSON.stringify(context)) as ConversionContext;
  const purchase = purchasePayload({ id: "in_utm", livemode: true, status: "paid", billing_reason: "subscription_create", amount_paid: 5000, currency: "usd", status_transitions: { paid_at: now.getTime() / 1000 } }, "student@example.com", "Student", savedContext, 5000);
  assert.ok(purchase);
  for (const [key, value] of Object.entries(utms)) {
    assert.equal(Reflect.get(signup, key), value, `signup lost ${key}`);
    assert.equal(Reflect.get(purchase, key), value, `purchase lost ${key}`);
  }
  assert.equal(revisited.changed, false);
  assert.equal(signup.fbc, `fb.1.${now.getTime()}.ad-click`);
});

test("a legacy cookie leaves unavailable UTMs empty instead of inventing them", () => {
  const attribution = parseAttributionCookie("src=free&utm_medium=paid_social");
  assert.ok(attribution);
  for (const key of ["utm_source", "utm_campaign", "utm_content", "utm_term"]) assert.equal(Reflect.get(attribution, key), null);
});

test("every UTM can independently trigger capture even without fbclid or utm_medium", () => {
  for (const key of UTM_KEYS) assert.equal(hasAttributionParams(new URLSearchParams({ [key]: "ad-label" })), true);
  assert.equal(hasAttributionParams(new URLSearchParams("next=/ultimate")), false);
});

test("a partial attributed visit updates supplied fields and keeps the rest", () => {
  const first = readAttributionParams(new URLSearchParams(utms), now.getTime());
  const next = readAttributionParams(new URLSearchParams({ utm_content: "video B" }), now.getTime());
  const merged = mergeAttribution(first, next, now.getTime());
  assert.equal(merged.changed, true);
  assert.equal(merged.attribution.utm_content, "video B");
  assert.equal(merged.attribution.utm_source, "facebook");
  assert.equal(merged.attribution.utm_campaign, "Fall SAT prep");
});

test("oversized and control-character UTMs cannot overflow or contaminate the cookie", () => {
  const landing = readAttributionParams(new URLSearchParams({ utm_source: "a".repeat(257), utm_campaign: "bad\nlabel", utm_content: "界".repeat(100), utm_term: "valid label" }), now.getTime());
  assert.equal(landing.utm_source, null);
  assert.equal(landing.utm_campaign, null);
  assert.equal(landing.utm_content, null);
  assert.equal(landing.utm_term, "valid label");
});
