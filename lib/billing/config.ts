import type { PlanCode } from "@/lib/auth/plans";
import { productionAppUrl } from "@/lib/auth/config";
import type { BillingCadence } from "./offers";

export type BillablePlan = Extract<PlanCode, "core" | "max">;

export const REFUND_WINDOW_HOURS = 24;

const CHECKOUT_REQUIRED_ENV = [
  "STRIPE_BILLING_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CORE_PRICE_ID",
  "STRIPE_CORE_THREE_MONTH_PRICE_ID",
  "STRIPE_MAX_PRICE_ID",
  "STRIPE_MAX_THREE_MONTH_PRICE_ID",
  "STRIPE_LEGACY_MAX_PRODUCT_IDS",
] as const;

export function billingCheckoutEnabled(): boolean {
  if (process.env.BILLING_ENABLED?.trim().toLowerCase() !== "true") return false;
  if (!configuredBillingMode()) return false;
  return CHECKOUT_REQUIRED_ENV.every((name) => Boolean(process.env[name]?.trim()));
}

// The "Stay & Save 40%" coupon. Stripe scopes coupons to a mode, so an id
// created in live mode does not resolve in test mode -- pointing both at one id
// is why accepting the offer failed everywhere except production. This default
// is the live coupon and is therefore only offered in live mode; test and
// preview environments name their own with STRIPE_RETENTION_COUPON_ID, and
// without one the save offer is simply not made.
const LIVE_RETENTION_COUPON_ID = "2SfA4hHs";

export function retentionCouponId(livemode: boolean): string | null {
  const configured = process.env.STRIPE_RETENTION_COUPON_ID?.trim();
  if (configured) return configured;
  return livemode ? LIVE_RETENTION_COUPON_ID : null;
}

export function billingLivemode(): boolean {
  const configuredMode = configuredBillingMode();
  if (configuredMode === "test") return false;
  if (configuredMode === "live") return true;
  return process.env.VERCEL_ENV === "production";
}

export function isBillablePlan(value: unknown): value is BillablePlan {
  return value === "core" || value === "max";
}

export function configuredPriceId(plan: BillablePlan, cadence: BillingCadence = "monthly"): string {
  const variable = cadence === "three_month"
    ? plan === "max" ? "STRIPE_MAX_THREE_MONTH_PRICE_ID" : "STRIPE_CORE_THREE_MONTH_PRICE_ID"
    : plan === "max" ? "STRIPE_MAX_PRICE_ID" : "STRIPE_CORE_PRICE_ID";
  const value = process.env[variable]?.trim();
  if (!value) throw new Error(`Stripe ${plan} price is not configured`);
  return value;
}

export function planForPriceId(priceId: string): BillablePlan | null {
  if (priceId === process.env.STRIPE_CORE_PRICE_ID?.trim()) return "core";
  if (priceId === process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID?.trim()) return "core";
  if (priceId === process.env.STRIPE_MAX_PRICE_ID?.trim()) return "max";
  if (priceId === process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID?.trim()) return "max";
  return null;
}

// Where an active subscription resolves to neither a configured price nor a
// known legacy product. Stripe has already confirmed these members are paying,
// so the one answer that is always wrong is "free": under-serving a paying
// member costs a support ticket and a churn risk, while over-serving one is
// undone with a click in the students admin panel. Every fallback is logged
// with its price id so the legacy mapping can be tightened toward zero.
export function legacyFallbackPlan(): BillablePlan {
  return process.env.STRIPE_LEGACY_FALLBACK_PLAN?.trim().toLowerCase() === "core" ? "core" : "max";
}

export function planForLegacyProductId(productId: string): BillablePlan | null {
  if (configuredIds("STRIPE_LEGACY_CORE_PRODUCT_IDS").has(productId)) return "core";
  if (configuredIds("STRIPE_LEGACY_MAX_PRODUCT_IDS").has(productId)) return "max";
  return null;
}

function configuredIds(name: string): Set<string> {
  return new Set(
    process.env[name]
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [],
  );
}

function configuredBillingMode(): "test" | "live" | null {
  const value = process.env.STRIPE_BILLING_MODE?.trim().toLowerCase();
  return value === "test" || value === "live" ? value : null;
}

export function billingBaseUrl(requestUrl: string): string {
  const previewUrl = process.env.BILLING_PREVIEW_URL?.trim();
  if (process.env.VERCEL_ENV === "preview" && previewUrl) {
    return previewUrl.replace(/\/$/, "");
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === "production") return productionAppUrl(requestUrl);
  return new URL(requestUrl).origin;
}
