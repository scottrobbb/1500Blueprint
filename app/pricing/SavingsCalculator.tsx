"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { EnrollButton } from "./EnrollButton";
import styles from "./pricing.module.css";

const MAX_MONTHLY_PRICE = 80;
const WEEKS_PER_MONTH = 52 / 12;
const HOURS_MIN = 1;
const HOURS_MAX = 10;
const PRICE_MIN = 20;
const PRICE_MAX = 200;
const PRICE_STEP = 5;
const PRICE_QUICK_PICKS = [50, 100, 150];

export function SavingsCalculator() {
  const [hoursPerWeek, setHoursPerWeek] = useState(3);
  const [pricePerHour, setPricePerHour] = useState(60);
  const hoursId = useId();
  const priceId = useId();

  const monthlyTutoring = Math.round(hoursPerWeek * pricePerHour * WEEKS_PER_MONTH);
  const savings = Math.max(0, monthlyTutoring - MAX_MONTHLY_PRICE);
  const percentLess = monthlyTutoring > 0 ? Math.round((savings / monthlyTutoring) * 100) : 0;
  const maxBarWidth = monthlyTutoring > 0 ? Math.max(6, Math.round((MAX_MONTHLY_PRICE / monthlyTutoring) * 100)) : 100;
  const hoursPercent = ((hoursPerWeek - HOURS_MIN) / (HOURS_MAX - HOURS_MIN)) * 100;
  const pricePercent = ((pricePerHour - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

  return (
    <div className={styles.savingsPanel}>
      <div className={styles.savingsCopy}>
        <h2>
          You could save <em>${savings.toLocaleString()} a month</em> compared with tutoring.
        </h2>
        <p>Based on {hoursPerWeek} hour{hoursPerWeek === 1 ? "" : "s"} per week at ${pricePerHour}/hour.</p>

        <div className={styles.savingsSlider}>
          <div className={styles.savingsSliderLabel}>
            <label htmlFor={hoursId}>Tutoring hours per week</label>
            <span>{hoursPerWeek} hour{hoursPerWeek === 1 ? "" : "s"}</span>
          </div>
          <input
            id={hoursId}
            type="range"
            min={HOURS_MIN}
            max={HOURS_MAX}
            step={1}
            value={hoursPerWeek}
            onChange={(event) => setHoursPerWeek(Number(event.target.value))}
            style={{ "--fill": `${hoursPercent}%` } as React.CSSProperties}
          />
        </div>

        <div className={styles.savingsSlider}>
          <div className={styles.savingsSliderLabel}>
            <label htmlFor={priceId}>Price per hour</label>
            <span>${pricePerHour}</span>
          </div>
          <input
            id={priceId}
            type="range"
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={PRICE_STEP}
            value={pricePerHour}
            onChange={(event) => setPricePerHour(Number(event.target.value))}
            style={{ "--fill": `${pricePercent}%` } as React.CSSProperties}
          />
          <div className={styles.savingsQuickPicks}>
            <span>Quick select</span>
            {PRICE_QUICK_PICKS.map((price) => (
              <button
                type="button"
                key={price}
                className={pricePerHour === price ? styles.savingsQuickActive : undefined}
                onClick={() => setPricePerHour(price)}
              >
                ${price}
              </button>
            ))}
          </div>
        </div>

        <EnrollButton className={styles.savingsAction}>
          See Max <ArrowIcon />
        </EnrollButton>
      </div>
      <div className={styles.costCard}>
        <Image src="/images/blu-normal-peek.png" alt="" width={160} height={160} className={styles.costCardPeek} />
        <div className={styles.costHeader}>
          <span>Monthly comparison</span>
        </div>
        <div className={styles.costRow}>
          <div>
            <strong>Private tutoring</strong>
          </div>
          <b>${monthlyTutoring.toLocaleString()}</b>
        </div>
        <div className={styles.costBar} aria-hidden="true"><span /></div>
        <div className={`${styles.costRow} ${styles.maxCostRow}`}>
          <div>
            <strong>1500 Blueprint Max</strong>
          </div>
          <b>${MAX_MONTHLY_PRICE}</b>
        </div>
        <div className={`${styles.costBar} ${styles.maxCostBar}`} aria-hidden="true"><span style={{ width: `${maxBarWidth}%` }} /></div>
        <div className={styles.savingsTotal}>
          <div>
            <span>You save</span>
            <strong>${savings.toLocaleString()} / month</strong>
          </div>
          <b>{percentLess}% less</b>
        </div>
        <p>Example only. Tutor rates vary.</p>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}
