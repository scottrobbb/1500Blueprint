"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { BillingCadence } from "@/lib/billing/offers";
import styles from "./pricing.module.css";

export function CorePricingPanel({
  billingEnabled,
  current,
  initialCadence,
  children,
}: {
  billingEnabled: boolean;
  current: boolean;
  initialCadence: BillingCadence;
  children: ReactNode;
}) {
  const [cadence, setCadence] = useState<BillingCadence>(initialCadence);
  const threeMonths = cadence === "three_month";

  return (
    <>
      <div className={styles.termSelector} aria-label="Core billing term">
        <button
          type="button"
          className={threeMonths ? styles.termOption : `${styles.termOption} ${styles.termActive}`}
          aria-pressed={!threeMonths}
          onClick={() => setCadence("monthly")}
        >
          <span>1 month</span>
          <strong>$50</strong>
        </button>
        <button
          type="button"
          className={threeMonths ? `${styles.termOption} ${styles.termActive}` : styles.termOption}
          aria-pressed={threeMonths}
          onClick={() => setCadence("three_month")}
        >
          <span>3 months <em>Save $30</em></span>
          <strong>$120</strong>
        </button>
      </div>

      <div className={styles.priceRow} aria-live="polite">
        <span>$</span>
        <strong>{threeMonths ? "120" : "50"}</strong>
        <em>{threeMonths ? "/ 3 months" : "/ month"}</em>
      </div>
      <p className={styles.billingDetail}>
        {threeMonths
          ? "$40/month equivalent · billed every 3 months · cancel anytime"
          : "Billed monthly · cancel anytime · no setup fee"}
      </p>

      {children}

      <div className={styles.actions}>
        {billingEnabled ? (
          <form action="/api/billing/checkout" method="post">
            <input type="hidden" name="plan" value="core" />
            <input type="hidden" name="cadence" value={cadence} />
            <button type="submit" className={styles.primaryAction}>
              {current ? "Manage or switch Core" : threeMonths ? "Choose 3 months" : "Choose Core"}
              <ArrowIcon />
            </button>
          </form>
        ) : (
          <button type="button" className={styles.disabledAction} disabled>Billing opens soon</button>
        )}
      </div>
    </>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}
