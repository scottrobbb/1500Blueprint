import type { PlanCode } from "@/lib/auth/plans";
import { CANONICAL_APP_URL } from "@/lib/auth/config";
import type { BillingCadence } from "./offers";

export type BillablePlan = Extract<PlanCode, "core" | "max">;

export const REFUND_WINDOW_HOURS = 24;

export function billingLivemode(): boolean {
  const configuredMode = process.env.STRIPE_BILLING_MODE?.trim().toLowerCase();
  if (configuredMode === "test") return false;
  if (configuredMode === "live") return true;
  return process.env.VERCEL_ENV === "production";
}

export function isBillablePlan(value: unknown): value is BillablePlan {
  return value === "core" || value === "max";
}

export function configuredPriceId(plan: BillablePlan, cadence: BillingCadence = "monthly"): string {
  const variable = plan === "max"
    ? "STRIPE_MAX_PRICE_ID"
    : cadence === "three_month"
      ? "STRIPE_CORE_THREE_MONTH_PRICE_ID"
      : "STRIPE_CORE_PRICE_ID";
  const value = process.env[variable]?.trim();
  if (!value) throw new Error(`Stripe ${plan} price is not configured`);
  return value;
}

export function planForPriceId(priceId: string): BillablePlan | null {
  if (priceId === process.env.STRIPE_CORE_PRICE_ID?.trim()) return "core";
  if (priceId === process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID?.trim()) return "core";
  if (priceId === process.env.STRIPE_MAX_PRICE_ID?.trim()) return "max";
  return null;
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

export function billingBaseUrl(requestUrl: string): string {
  const previewUrl = process.env.BILLING_PREVIEW_URL?.trim();
  if (process.env.VERCEL_ENV === "preview" && previewUrl) {
    return previewUrl.replace(/\/$/, "");
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === "production") return CANONICAL_APP_URL;
  return new URL(requestUrl).origin;
}
