import assert from "node:assert/strict";
import test from "node:test";
import { appBaseUrl, CANONICAL_APP_URL, resolveProductionOrigin } from "./config";

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

test("production auth links remain pinned to the canonical public domain", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_URL: "deployment.vercel.app",
    AUTH_PREVIEW_URL: undefined,
  }, () => {
    assert.equal(appBaseUrl("https://fallback.example"), CANONICAL_APP_URL);
  });
});

test("a second known app domain stays on itself instead of bouncing to canonical", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_URL: "deployment.vercel.app",
    AUTH_PREVIEW_URL: undefined,
  }, () => {
    assert.equal(appBaseUrl("https://1500blueprint.com"), "https://1500blueprint.com");
    assert.equal(appBaseUrl("https://www.1500blueprint.com"), "https://www.1500blueprint.com");
  });
});

test("resolveProductionOrigin only trusts the app's own known domains", () => {
  assert.equal(resolveProductionOrigin(CANONICAL_APP_URL), CANONICAL_APP_URL);
  assert.equal(resolveProductionOrigin("https://1500blueprint.com"), "https://1500blueprint.com");
  assert.equal(resolveProductionOrigin("https://www.1500blueprint.com"), "https://www.1500blueprint.com");
  assert.equal(resolveProductionOrigin("https://attacker.example"), CANONICAL_APP_URL);
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
