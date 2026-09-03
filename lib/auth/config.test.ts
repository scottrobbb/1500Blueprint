import assert from "node:assert/strict";
import test from "node:test";
import {
  accountConfirmationUrl,
  allowedAppOrigins,
  appBaseUrl,
  canonicalAppUrl,
  canonicalHostRedirect,
  magicLinkCallbackUrl,
} from "./config";
import { billingBaseUrl } from "../billing/config";
import { isSameOriginRequest } from "../security/request";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";

test("preview auth links stay on the Vercel preview instead of production", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "preview-branch.vercel.app",
    AUTH_PREVIEW_URL: undefined,
  }, () => {
    assert.equal(appBaseUrl("https://fallback.example"), "https://preview-branch.vercel.app");
  });
});

test("a stable preview auth URL overrides the deployment-specific Vercel URL", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "deployment.vercel.app",
    AUTH_PREVIEW_URL: "https://stripe-sandbox.example/",
  }, () => {
    assert.equal(appBaseUrl("https://fallback.example"), "https://stripe-sandbox.example");
  });
});

test("production auth and billing links use the configured canonical public domain", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_URL: "deployment.vercel.app",
    AUTH_PREVIEW_URL: undefined,
    NEXT_PUBLIC_APP_URL: "https://www.new-blueprint.example/",
    APP_ALLOWED_ORIGINS: undefined,
  }, () => {
    assert.equal(canonicalAppUrl(), "https://www.new-blueprint.example");
    assert.equal(appBaseUrl("https://fallback.example"), "https://www.new-blueprint.example");
    assert.equal(billingBaseUrl("https://fallback.example/api/billing/checkout"), "https://www.new-blueprint.example");
    assert.equal(
      magicLinkCallbackUrl("magic-token", "https://fallback.example"),
      "https://www.new-blueprint.example/api/auth/callback?token=magic-token",
    );
    assert.equal(
      accountConfirmationUrl(
        "signup-token",
        "signup",
        "/ultimate",
        "https://fallback.example",
      ),
      "https://www.new-blueprint.example/account/confirm?token_hash=signup-token&type=signup&next=%2Fultimate",
    );
    assert.equal(
      accountConfirmationUrl(
        "recovery-token",
        "recovery",
        "/account/reset-password",
        "https://fallback.example",
      ),
      "https://www.new-blueprint.example/account/confirm?token_hash=recovery-token&type=recovery&next=%2Faccount%2Freset-password",
    );
  });
});

test("production accepts only exact allowlisted app origins while retaining one canonical URL", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://www.1500satblueprint.com",
    APP_ALLOWED_ORIGINS: "https://1500blueprint.com, https://www.1500satblueprint.com/",
  }, () => {
    assert.equal(canonicalAppUrl(), "https://www.1500satblueprint.com");
    assert.deepEqual([...allowedAppOrigins()].sort(), [
      "https://1500blueprint.com",
      "https://www.1500satblueprint.com",
    ]);

    const newDomainRequest = new Request("https://1500blueprint.com/api/billing/checkout", {
      method: "POST",
      headers: { origin: "https://1500blueprint.com" },
    });
    const newDomainBase = billingBaseUrl(newDomainRequest.url);
    assert.equal(newDomainBase, "https://1500blueprint.com");
    assert.equal(appBaseUrl("https://1500blueprint.com"), "https://1500blueprint.com");
    assert.equal(isSameOriginRequest(newDomainRequest, newDomainBase), true);
    assert.equal(isSameOriginRequest(new Request(newDomainRequest.url, {
      method: "POST",
      headers: { origin: "https://www.1500satblueprint.com" },
    }), newDomainBase), false);

    const unknownRequest = new Request("https://deployment.vercel.app/api/billing/checkout", {
      method: "POST",
      headers: { origin: "https://deployment.vercel.app" },
    });
    const unknownBase = billingBaseUrl(unknownRequest.url);
    assert.equal(unknownBase, "https://www.1500satblueprint.com");
    assert.equal(isSameOriginRequest(unknownRequest, unknownBase), false);
    assert.equal(isSameOriginRequest(new Request(unknownRequest.url, {
      method: "POST",
      headers: { origin: "https://www.1500satblueprint.com" },
    }), unknownBase), false);
  });
});

test("development accepts localhost origins for local app URLs", () => {
  withEnvironment({
    NODE_ENV: "development",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  }, () => {
    assert.equal(canonicalAppUrl(), "http://localhost:3000");
  });
});

test("canonical production URLs reject unsafe or ambiguous origins", () => {
  for (const invalid of [
    "http://blueprint.example",
    "https://localhost",
    "https://blueprint.example:8443",
    "https://blueprint.example/path",
    "https://user:password@blueprint.example",
    "https://blueprint.example?host=other.example",
  ]) {
    withEnvironment({ NEXT_PUBLIC_APP_URL: invalid }, () => {
      assert.throws(() => canonicalAppUrl(), /HTTPS origin/);
    });
  }
});

test("additional production origins reject wildcards and malformed lists", () => {
  for (const invalid of [
    "http://1500blueprint.com",
    "https://*.1500blueprint.com",
    "https://1500blueprint.com/path",
    "https://user:password@1500blueprint.com",
    "https://1500blueprint.com,",
    Array.from({ length: 9 }, (_, index) => `https://domain-${index}.example`).join(","),
  ]) {
    withEnvironment({ APP_ALLOWED_ORIGINS: invalid }, () => {
      assert.throws(() => allowedAppOrigins(), /APP_ALLOWED_ORIGINS/);
    });
  }
});

test("robots and sitemap publish only canonical public pricing URLs", () => {
  withEnvironment({ NEXT_PUBLIC_APP_URL: "https://blueprint.example" }, () => {
    const robotsFile = robots();
    assert.equal(robotsFile.host, "https://blueprint.example");
    assert.equal(robotsFile.sitemap, "https://blueprint.example/sitemap.xml");
    assert.deepEqual(sitemap(), [{
      url: "https://blueprint.example/pricing",
      changeFrequency: "weekly",
      priority: 1,
    }]);
  });
});

function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => void,
): void {
  const original = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    callback();
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const PRODUCTION_HOSTS = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://1500blueprint.com",
  APP_ALLOWED_ORIGINS: "https://www.1500satblueprint.com,https://1500satblueprint.com",
} as const;

test("a request on the deployment's Vercel host is moved to the canonical domain", () => {
  withEnvironment(PRODUCTION_HOSTS, () => {
    assert.equal(
      canonicalHostRedirect("https://1500-blueprint.vercel.app/max?utm=yt"),
      "https://1500blueprint.com/max?utm=yt",
    );
    // Path and query survive, so a shared deep link still lands where it meant to.
    assert.equal(
      canonicalHostRedirect("https://1500-blueprint.vercel.app/checkout?plan=max&cadence=monthly"),
      "https://1500blueprint.com/checkout?plan=max&cadence=monthly",
    );
  });
});

test("the canonical domain and every allowed origin are left alone", () => {
  withEnvironment(PRODUCTION_HOSTS, () => {
    assert.equal(canonicalHostRedirect("https://1500blueprint.com/pricing"), null);
    // The second production domain has to keep working on its own host.
    assert.equal(canonicalHostRedirect("https://www.1500satblueprint.com/pricing"), null);
    assert.equal(canonicalHostRedirect("https://1500satblueprint.com/pricing"), null);
  });
});

test("webhook and API traffic is never redirected", () => {
  withEnvironment(PRODUCTION_HOSTS, () => {
    // A sender holds a fixed URL; a redirect breaks delivery instead of moving
    // a person.
    assert.equal(canonicalHostRedirect("https://1500-blueprint.vercel.app/api/billing/webhook"), null);
    assert.equal(canonicalHostRedirect("https://1500-blueprint.vercel.app/api/tests/complete"), null);
  });
});

test("previews and local development are never redirected", () => {
  withEnvironment({ ...PRODUCTION_HOSTS, VERCEL_ENV: "preview" }, () => {
    assert.equal(canonicalHostRedirect("https://preview-branch.vercel.app/pricing"), null);
  });
  withEnvironment({ ...PRODUCTION_HOSTS, VERCEL_ENV: undefined, NODE_ENV: "development" }, () => {
    assert.equal(canonicalHostRedirect("http://localhost:3000/pricing"), null);
  });
});

test("localhost is left alone even when VERCEL_ENV is pinned to production", () => {
  // .env.local pins VERCEL_ENV=production to exercise production code paths, so
  // the loopback bypass is what keeps `next dev` off the live site.
  withEnvironment(PRODUCTION_HOSTS, () => {
    assert.equal(canonicalHostRedirect("http://localhost:3000/pricing"), null);
    assert.equal(canonicalHostRedirect("http://127.0.0.1:3000/max"), null);
  });
});
