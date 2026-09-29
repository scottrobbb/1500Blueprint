"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Counts active time on student pages for the admin "Time on site" view. A
// second counts only while the page is visible and the student has used it in
// the last few minutes, so an open, forgotten tab adds nothing. Watching an
// embedded video (focus inside an iframe) gets a longer allowance, since it
// produces no input events in this page.
const STUDENT_PREFIXES = ["/ultimate", "/practice-test", "/drills", "/flashcards", "/history", "/community", "/settings"];
const EXCLUDED_PREFIXES = ["/ultimate/admin"];
const TICK_MS = 5_000;
const FLUSH_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const VIDEO_IDLE_MS = 30 * 60_000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isStudentPage(pathname: string): boolean {
  return STUDENT_PREFIXES.some((prefix) => matches(pathname, prefix))
    && !EXCLUDED_PREFIXES.some((prefix) => matches(pathname, prefix));
}

export function ActivityTracker() {
  const pathname = usePathname();
  const tracking = isStudentPage(pathname ?? "");

  useEffect(() => {
    if (!tracking) return;

    let lastInput = Date.now();
    let lastTick = Date.now();
    let pending = 0;
    let stopped = false;

    const onInput = () => { lastInput = Date.now(); };
    const isActive = (now: number) => {
      if (document.visibilityState !== "visible") return false;
      const watchingEmbed = document.activeElement?.tagName === "IFRAME";
      return now - lastInput < (watchingEmbed ? VIDEO_IDLE_MS : IDLE_MS);
    };

    const tick = () => {
      const now = Date.now();
      // Background timers are throttled; never credit more than a tick or two.
      const elapsed = Math.min(now - lastTick, TICK_MS * 2);
      lastTick = now;
      if (isActive(now)) pending += elapsed / 1000;
    };

    const flush = (beacon: boolean) => {
      tick();
      const seconds = Math.floor(pending);
      if (stopped || seconds <= 0) return;
      pending -= seconds;
      const body = JSON.stringify({ seconds });
      if (beacon && navigator.sendBeacon?.("/api/activity", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true })
        .then((response) => { if (response.status === 401) stopped = true; })
        .catch(() => {});
    };

    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onPageHide = () => flush(true);

    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    const tickTimer = window.setInterval(tick, TICK_MS);
    const flushTimer = window.setInterval(() => flush(false), FLUSH_MS);

    return () => {
      flush(true);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);
    };
  }, [tracking]);

  return null;
}
