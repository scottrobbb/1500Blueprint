"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { PlanCode } from "@/lib/auth/plans";
import type { BillingCadence, CheckoutTerm } from "@/lib/billing/offers";
import { ReferralField } from "@/components/marketing/ReferralField";
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
    three_month: { perMonth: "59.67", billed: "Billed $179 every 3 months" },
  },
};

const ALL_PLANS = ["free", "core", "max"] as const;

export function PlansPanel({
  freeFeatures,
  coreFeatures,
  maxFeatures,
  currentPlan,
  billingEnabled,
  weekPassEnabled,
  initialCadence,
  checkoutTokens,
  visiblePlans = ALL_PLANS,
}: {
  freeFeatures: PlanFeature[];
  coreFeatures: PlanFeature[];
  maxFeatures: PlanFeature[];
  currentPlan: PlanCode | null;
  billingEnabled: boolean;
  weekPassEnabled: boolean;
  initialCadence: CheckoutTerm;
  checkoutTokens: Record<"core" | "max", string>;
  // Single-tier landing pages render a subset. Defaults to every plan, so the
  // pricing page keeps its three cards without passing anything.
  visiblePlans?: readonly PlanCode[];
}) {
  const [cadence, setCadence] = useState<CheckoutTerm>(initialCadence);
  // Backing out of Stripe, or any billing failure, returns here rather than to
  // the full plan comparison -- a single-tier landing page should not hand the
  // reader the other tiers on the way back.
  const returnTo = usePathname();
  const oneWeek = cadence === "one_week";
  const shows = (plan: PlanCode) => visiblePlans.includes(plan) && (!oneWeek || plan === "max");
  // The billing term only changes a paid price, so it has nothing to switch on
  // a page showing Free alone.
  const showCadence = shows("core") || shows("max");
  const singleTier = oneWeek || visiblePlans.length === 1;

  return (
    <>
      {showCadence ? (
      <div className={styles.cadenceToggle} role="radiogroup" aria-label="Access duration">
        {visiblePlans.includes("max") ? <button
          type="button"
          role="radio"
          aria-checked={oneWeek}
          className={oneWeek ? `${styles.cadenceOption} ${styles.cadenceActive}` : styles.cadenceOption}
          onClick={() => setCadence("one_week")}
        >
          1 week
        </button> : null}
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
          3 months <em title="Savings on Max compared with paying monthly">Save $61</em>
        </button>
      </div>
      ) : null}

      <div className={singleTier ? `${styles.planGrid} ${styles.planGridSingle}` : styles.planGrid}>
        {shows("free") ? (
        <PriceCard
          tier="free"
          name="Free"
          description="Start for free"
          features={freeFeatures}
          cta="Get Started"
          currentPlan={currentPlan}
        />
        ) : null}
        {shows("core") ? (
        <PriceCard
          tier="core"
          name="Core"
          features={coreFeatures}
          cta="Choose Core"
          currentPlan={currentPlan}
          billingEnabled={billingEnabled}
          cadence={cadence}
          checkoutToken={checkoutTokens.core}
          returnTo={returnTo}
        />
        ) : null}
        {shows("max") ? (
        <PriceCard
          tier="max"
          name="Max"
          features={oneWeek ? maxFeatures.filter((feature) => feature.label !== "Everything in Core") : maxFeatures}
          cta={oneWeek ? "Get 1 week of Max" : "Choose Max"}
          currentPlan={currentPlan}
          billingEnabled={oneWeek ? weekPassEnabled : billingEnabled}
          cadence={cadence}
          checkoutToken={checkoutTokens.max}
          returnTo={returnTo}
        />
        ) : null}
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
  checkoutToken,
  returnTo,
}: {
  tier: "free" | "core" | "max";
  name: string;
  description?: string;
  features: PlanFeature[];
  cta: string;
  currentPlan: PlanCode | null;
  billingEnabled?: boolean;
  cadence?: CheckoutTerm;
  checkoutToken?: string;
  returnTo?: string;
}) {
  const paid = tier !== "free";
  const plan = tier === "core" ? "core" : tier === "max" ? "max" : "free";
  const oneWeek = cadence === "one_week";
  const current = !oneWeek && currentPlan === plan;
  const requiresAccount = paid && currentPlan === null;
  const priceInfo = oneWeek ? { perMonth: "39", billed: "One-time payment for 7 days" } : tier === "core" || tier === "max" ? CADENCE_PRICE[tier][cadence ?? "monthly"] : { perMonth: "0", billed: null };

  return (
    <article id={`plan-${tier}`} className={`${styles.priceCard} ${styles[tier]}`}>
      {tier === "max" ? (
        <Image src="/images/blu-peek-pricing.png" alt="" width={220} height={220} className={styles.maxPeek} />
      ) : null}
      <div className={styles.planName}>
        <h3>{name}</h3>
      </div>

      <div className={styles.priceRow}>
        <span>$</span><strong>{priceInfo.perMonth}</strong><em>{oneWeek ? "once" : "/month"}</em>
      </div>
      {paid ? <p className={styles.billingDetail}>{priceInfo.billed ?? "Billed monthly"}</p> : null}

      {oneWeek ? <p className={styles.planDescription}>No subscription. No automatic renewal. You won’t be charged again.</p> : null}
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
            <>
              <form action="/api/billing/checkout" method="post">
                <ReferralField />
                <input type="hidden" name="plan" value={plan} />
                <input type="hidden" name="cadence" value={cadence ?? "monthly"} />
                <input type="hidden" name="checkoutToken" value={checkoutToken} />
                <input type="hidden" name="returnTo" value={oneWeek ? `${returnTo ?? "/pricing"}?plan=max&cadence=one_week#plans` : returnTo ?? ""} />
                <button type="submit" className={styles.primaryAction}>
                  {current ? "Manage plan" : cta} <ArrowIcon />
                </button>
              </form>
              {requiresAccount ? (
                <p className={styles.accountRequired}>
                  Account required before checkout. You’ll return here after signing in or creating one.
                </p>
              ) : null}
            </>
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
