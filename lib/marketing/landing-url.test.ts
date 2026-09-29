import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { landingUrlCookieUpdate, readLandingUrlCookie } from "./landing-url";
import { EMPTY_UTMS } from "./attribution";
import { registrationPayload, purchasePayload, type ConversionContext } from "./conversions";

const url = "https://1500blueprint.com/pricing?fbclid=ad-click&utm_source=facebook&utm_campaign=Fall%20SAT&ad_id=123&custom=a%2Bb";

test("original full landing URL survives navigation and reaches both webhook payloads", () => {
  const cookie = landingUrlCookieUpdate(url, "GET", undefined);
  assert.ok(cookie);
  const landingUrl = readLandingUrlCookie(cookie);
  assert.equal(landingUrl, url);
  assert.equal(landingUrlCookieUpdate("https://1500blueprint.com/account/sign-up", "GET", cookie), null);
  assert.equal(landingUrlCookieUpdate("https://1500blueprint.com/checkout?plan=max", "GET", cookie), null);
  const context: ConversionContext = {
    ...EMPTY_UTMS, fbclid: "ad-click", fbc: "fb.1.1790700000000.ad-click", fbp: null,
    landing_page: "/pricing", landing_url: landingUrl, event_source_url: "https://1500blueprint.com/account/sign-up",
    client_ip_address: null, client_user_agent: "test",
  };
  const now = new Date("2026-09-29T20:00:00Z");
  assert.equal(registrationPayload("student@example.com", "Student", context, now).landing_url, url);
  const saved = JSON.parse(JSON.stringify(context)) as ConversionContext;
  const purchase = purchasePayload({ id: "in_landing", livemode: true, status: "paid", billing_reason: "subscription_create", amount_paid: 5000, currency: "usd", status_transitions: { paid_at: now.getTime() / 1000 } }, "student@example.com", "Student", saved, 5000);
  assert.equal(purchase?.landing_url, url);
});

test("a new ad click replaces the landing URL; refreshes and form submissions do not", () => {
  const cookie = landingUrlCookieUpdate(url, "GET", undefined)!;
  assert.equal(landingUrlCookieUpdate(url, "GET", cookie), null);
  assert.equal(landingUrlCookieUpdate(url, "POST", undefined), null);
  const next = "https://1500blueprint.com/free?fbclid=new-click&utm_source=instagram";
  assert.equal(readLandingUrlCookie(landingUrlCookieUpdate(next, "GET", cookie)), next);
});

test("untagged first arrivals retain arbitrary query parameters for diagnosis", () => {
  const entry = "https://www.1500satblueprint.com/free?source=facebook&campaign=fall";
  assert.equal(readLandingUrlCookie(landingUrlCookieUpdate(entry, "GET", undefined)), entry);
});

test("auth callbacks and credentials never enter the landing URL payload", () => {
  for (const path of ["/api/auth/callback?token=secret", "/account/confirm?token_hash=secret", "/account/reset-password?code=secret", "/ultimate/admin/students/private@example.com"]) {
    assert.equal(landingUrlCookieUpdate("https://1500blueprint.com" + path, "GET", undefined), null);
  }
  const cookie = landingUrlCookieUpdate("https://1500blueprint.com/free?utm_source=facebook&token=secret&code=secret&client_secret=secret#access_token=secret", "GET", undefined);
  assert.equal(readLandingUrlCookie(cookie), "https://1500blueprint.com/free?utm_source=facebook");
});

test("long campaign URLs stay complete within a bounded cookie", () => {
  const longUrl = "https://1500blueprint.com/free?utm_campaign=" + "long-campaign-".repeat(350);
  const cookie = landingUrlCookieUpdate(longUrl, "GET", undefined)!;
  assert.ok(cookie.length < 3500);
  assert.equal(readLandingUrlCookie(cookie), longUrl);
  assert.equal(readLandingUrlCookie("not-a-valid-cookie"), null);
});

test("unrepresentable URLs are omitted instead of truncated or mistaken for a previous landing", () => {
  const opaque = Array.from({ length: 100 }, (_, i) => createHash("sha256").update(String(i)).digest("hex")).join("");
  const cookie = landingUrlCookieUpdate(`https://1500blueprint.com/free?fbclid=new-click&opaque=${opaque}`, "GET", landingUrlCookieUpdate(url, "GET", undefined)!);
  assert.equal(readLandingUrlCookie(cookie), "");
  const bomb = "v1." + deflateRawSync("x".repeat(100_000)).toString("base64url");
  assert.equal(readLandingUrlCookie(bomb), null);
});

test("forwarding the same click to signup preserves the actual landing URL", () => {
  const cookie = landingUrlCookieUpdate(url, "GET", undefined)!;
  assert.equal(landingUrlCookieUpdate("https://1500blueprint.com/account/sign-up?fbclid=ad-click", "GET", cookie), null);
  assert.equal(readLandingUrlCookie(landingUrlCookieUpdate("https://1500blueprint.com/free?utm_source=facebook&_rsc=internal", "GET", undefined)), "https://1500blueprint.com/free?utm_source=facebook");
});
