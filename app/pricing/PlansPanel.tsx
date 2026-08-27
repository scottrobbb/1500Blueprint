"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlanCode } from "@/lib/auth/plans";
import type { BillingCadence } from "@/lib/billing/offers";
import { FeatureGlyph, type FeatureIcon } from "./FeatureGlyph";
import styles from "./pricing.module.css";

export type PlanFeature = { label: string; icon: FeatureIcon };

const CADENCE_PRICE: Record<"core" | "max", Record<BillingCadence, { perMonth: string; billed: string | null }>> = {
  core: {
    monthly: { perMonth: "50", billed: null },
    three_month: { perMonth: "40", billed: "Billed $120 every 3 months" },
  },
  max: {
    monthly: { perMonth: "80", billed: null },
    three_month: { perMonth: "70", billed: "Billed $210 every 3 months" },
  },
};

export function PlansPanel({
  freeFeatures,
  coreFeatures,
  maxFeatures,
  currentPlan,
  billingEnabled,
  initialCadence,
}: {
  freeFeatures: PlanFeature[];
  coreFeatures: PlanFeature[];
  maxFeatures: PlanFeature[];
  currentPlan: PlanCode | null;
  billingEnabled: boolean;
  initialCadence: BillingCadence;
}) {
  const [cadence, setCadence] = useState<BillingCadence>(initialCadence);

  return (
    <>
      <div className={styles.cadenceToggle} role="radiogroup" aria-label="Billing term">
        <button
          type="button"
          role="radio"
          aria-checked={cadence === "monthly"}
          className={cadence === "monthly" ? `${styles.cadenceOption} ${styles.cadenceActive}` : styles.cadenceOption}
          onClick={() => setCadence("monthly")}
        >
          1 month
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={cadence === "three_month"}
          className={cadence === "three_month" ? `${styles.cadenceOption} ${styles.cadenceActive}` : styles.cadenceOption}
          onClick={() => setCadence("three_month")}
        >
          3 months <em>Save $30</em>
        </button>
      </div>

      <div className={styles.planGrid}>
        <PriceCard
          tier="free"
          name="Free"
          description="Start for free"
          features={freeFeatures}
          cta="Get Started"
          currentPlan={currentPlan}
        />
        <PriceCard
          tier="core"
          name="Core"
          features={coreFeatures}
          cta="Choose Core"
          currentPlan={currentPlan}
          billingEnabled={billingEnabled}
          cadence={cadence}
        />
        <PriceCard
          tier="max"
          name="Max"
          features={maxFeatures}
          cta="Choose Max"
          currentPlan={currentPlan}
          billingEnabled={billingEnabled}
          cadence={cadence}
        />
      </div>
    </>
  );
}

function PriceCard({
  tier,
  name,
  description,
  features,
  cta,
  currentPlan,
  billingEnabled = false,
  cadence,
}: {
  tier: "free" | "core" | "max";
  name: string;
  description?: string;
  features: PlanFeature[];
  cta: string;
  currentPlan: PlanCode | null;
  billingEnabled?: boolean;
  cadence?: BillingCadence;
}) {
  const paid = tier !== "free";
  const plan = tier === "core" ? "core" : tier === "max" ? "max" : "free";
  const current = currentPlan === plan;
  const priceInfo = tier === "core" || tier === "max" ? CADENCE_PRICE[tier][cadence ?? "monthly"] : { perMonth: "0", billed: null };

  return (
    <article className={`${styles.priceCard} ${styles[tier]}`}>
      <div className={styles.planName}>
        <h3>{name}</h3>
      </div>

      <div className={styles.priceRow}>
        <span>$</span><strong>{priceInfo.perMonth}</strong><em>/month</em>
      </div>
      {paid ? <p className={styles.billingDetail}>{priceInfo.billed ?? "Billed monthly"}</p> : null}

      {description ? <p className={styles.planDescription}>{description}</p> : null}
      <div className={styles.cardRule} />
      <p className={styles.includesLabel}>Includes</p>
      <ul className={styles.features}>
        {features.map((feature) => (
          <li key={feature.label}>
            <FeatureGlyph name={feature.icon} />
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        {paid ? (
          billingEnabled ? (
            <form action="/api/billing/checkout" method="post">
              <input type="hidden" name="plan" value={plan} />
              <input type="hidden" name="cadence" value={cadence ?? "monthly"} />
              <button type="submit" className={styles.primaryAction}>
                {current ? "Manage plan" : cta} <ArrowIcon />
              </button>
            </form>
          ) : (
            <button type="button" className={styles.disabledAction} disabled>
              Billing opens soon
            </button>
          )
        ) : (
          <Link
            href={currentPlan ? "/ultimate" : "/account/sign-up?next=/ultimate"}
            className={styles.primaryAction}
          >
            {cta} <ArrowIcon />
          </Link>
        )}
      </div>
    </article>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}
