"use client";

import { useSyncExternalStore } from "react";
import { upcomingSatDates } from "@/lib/study-planner/sat-dates";
import styles from "./pricing.module.css";

// The countdown target depends on the viewer's clock, so it can only be
// computed client-side. useSyncExternalStore with a null server snapshot
// renders a static placeholder during SSR/hydration, then swaps in the real
// ticking countdown on the client — no hydration mismatch, no
// setState-in-effect. Re-renders every second via the interval below.
function subscribe(callback: () => void): () => void {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}
function getSnapshot(): number {
  return Date.now();
}
function getServerSnapshot(): number | null {
  return null;
}

export function ExamCountdown() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) {
    return (
      <div className={styles.countdown} aria-hidden="true">
        <p className={styles.countdownLabel}>&nbsp;</p>
        <CountdownRow days={0} hours={0} minutes={0} seconds={0} />
      </div>
    );
  }

  const todayIso = new Date(now).toISOString().slice(0, 10);
  const nextDate = upcomingSatDates(todayIso)[0];
  if (!nextDate) return null;

  const target = new Date(`${nextDate}T08:00:00`);
  const remainingMs = Math.max(0, target.getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const label = target.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className={styles.countdown}>
      <p className={styles.countdownLabel}>The SAT exam is on {label} — time is ticking!</p>
      <CountdownRow days={days} hours={hours} minutes={minutes} seconds={seconds} />
    </div>
  );
}

function CountdownRow({ days, hours, minutes, seconds }: { days: number; hours: number; minutes: number; seconds: number }) {
  return (
    <div className={styles.countdownRow}>
      <CountdownUnit value={days} label="Days" />
      <span className={styles.countdownColon}>:</span>
      <CountdownUnit value={hours} label="Hours" />
      <span className={styles.countdownColon}>:</span>
      <CountdownUnit value={minutes} label="Minutes" />
      <span className={styles.countdownColon}>:</span>
      <CountdownUnit value={seconds} label="Seconds" />
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.countdownUnit}>
      <strong>{String(value).padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}
