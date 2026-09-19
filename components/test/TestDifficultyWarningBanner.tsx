"use client";

import { useState } from "react";
import { difficultyWarningDismissedCookie } from "@/lib/sat/difficulty-warning";

// Fixed red with static white so it stays red and readable in dark mode, where
// the danger tokens and text-white swap.
export function TestDifficultyWarningBanner({ className = "" }: { className?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function dismiss() {
    document.cookie = difficultyWarningDismissedCookie();
    setDismissed(true);
  }

  return (
    <div className={`flex items-start gap-2 bg-red-700 py-3 pl-2 pr-4 text-static-white sm:pr-5 ${className}`}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this warning"
        className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg transition-colors hover:bg-static-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-static-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <p className="py-1.5 text-[14px] leading-[1.55]">
        <strong className="font-extrabold">Warning:</strong> My practice tests are substantially harder than the real SAT
        and the Bluebook practice tests. If you get a low score, don&apos;t be discouraged. They&apos;re built to
        overprepare you for the real SAT.
      </p>
    </div>
  );
}
