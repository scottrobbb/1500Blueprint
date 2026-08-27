import type { BillablePlan } from "./config";

export type BillingCadence = "monthly" | "three_month";

export type BillingOffer = {
  plan: BillablePlan;
  cadence: BillingCadence;
  amount: number;
  intervalCount: number;
  label: string;
};

const OFFERS: Record<BillablePlan, Partial<Record<BillingCadence, BillingOffer>>> = {
  core: {
    monthly: {
      plan: "core",
      cadence: "monthly",
      amount: 5_000,
      intervalCount: 1,
      label: "Core — 1 month",
    },
    three_month: {
      plan: "core",
      cadence: "three_month",
      amount: 12_000,
      intervalCount: 3,
      label: "Core — 3 months",
    },
  },
  max: {
    monthly: {
      plan: "max",
      cadence: "monthly",
      amount: 8_000,
      intervalCount: 1,
      label: "Max — 1 month",
    },
  },
};

export function isBillingCadence(value: unknown): value is BillingCadence {
  return value === "monthly" || value === "three_month";
}

export function billingOffer(plan: BillablePlan, cadence: BillingCadence): BillingOffer {
  const offer = OFFERS[plan][cadence];
  if (!offer) throw new Error(`The ${plan} plan is not available with ${cadence} billing`);
  return offer;
}

export function billingCadenceForInterval(interval: string | null, intervalCount: number | null): BillingCadence {
  return interval === "month" && intervalCount === 3 ? "three_month" : "monthly";
}
