import assert from "node:assert/strict";
import test from "node:test";
import {
  accountConfirmationUrl,
  appBaseUrl,
  canonicalAppUrl,
  magicLinkCallbackUrl,
} from "./config";
import { billingBaseUrl } from "../billing/config";
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
