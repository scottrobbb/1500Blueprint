import assert from "node:assert/strict";
import test from "node:test";
import { appBaseUrl, CANONICAL_APP_URL } from "./config";

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
