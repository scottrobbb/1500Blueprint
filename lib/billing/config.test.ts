import assert from "node:assert/strict";
import test from "node:test";
import { canonicalAppUrl } from "@/lib/auth/config";
import { billingBaseUrl } from "./config";

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

test("checkout on a second known app domain stays on that domain instead of failing same-origin", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    BILLING_PREVIEW_URL: undefined,
    VERCEL_URL: undefined,
    NEXT_PUBLIC_APP_URL: undefined,
  }, () => {
    assert.equal(
      billingBaseUrl("https://1500blueprint.com/api/billing/checkout"),
      "https://1500blueprint.com",
    );
  });
});

test("checkout on an unrecognized domain still falls back to the canonical one", () => {
  withEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    BILLING_PREVIEW_URL: undefined,
    VERCEL_URL: undefined,
    NEXT_PUBLIC_APP_URL: undefined,
  }, () => {
    assert.equal(
      billingBaseUrl("https://attacker.example/api/billing/checkout"),
      canonicalAppUrl(),
    );
  });
});
