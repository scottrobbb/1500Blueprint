"use client";

import { useCallback, useState } from "react";
import { useModalA11y } from "./useModalA11y";

export function OnboardingTour({ firstName, dailyTarget }: { firstName: string; dailyTarget: number }) {
  const [open, setOpen] = useState(true);
  const finish = useCallback(() => {
    setOpen(false);
    void fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {
      // Non-blocking: the introduction may appear again if the request fails.
    });
  }, []);
  const dialogRef = useModalA11y(open, finish);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close welcome guide"
        className="absolute inset-0 bg-navy/45"
        onClick={finish}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        tabIndex={-1}
        className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-t-2xl border border-navy/12 bg-white sm:rounded-2xl"
      >
        <div className="border-b border-navy/10 px-5 py-5 sm:px-7 sm:py-6">
          <h2 id="onboarding-title" className="text-balance font-display text-2xl font-bold tracking-[-0.02em] text-navy">
            Welcome, {firstName}.
          </h2>
          <p id="onboarding-description" className="mt-2 text-pretty text-[15px] leading-6 text-navy/60">
            Your home page is organized around the 3 things that improve an SAT score: focused practice, full tests, and careful review.
          </p>
        </div>

        <ol className="divide-y divide-navy/[0.08] px-5 sm:px-7">
          <li className="flex gap-4 py-4">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ice text-sm font-semibold text-brand-600" aria-hidden="true">1</span>
            <div>
              <h3 className="text-sm font-semibold text-navy">Continue when you can</h3>
              <p className="mt-1 text-sm leading-6 text-navy/55">Your latest study session appears first, so returning to unfinished work only takes one step.</p>
            </div>
          </li>
          <li className="flex gap-4 py-4">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ice text-sm font-semibold text-brand-600" aria-hidden="true">2</span>
            <div>
              <h3 className="text-sm font-semibold text-navy">Choose work by outcome</h3>
              <p className="mt-1 text-sm leading-6 text-navy/55">Practice a skill, take a full test, or review completed work depending on what you need today.</p>
            </div>
          </li>
          <li className="flex gap-4 py-4">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ice text-sm font-semibold text-brand-600" aria-hidden="true">3</span>
            <div>
              <h3 className="text-sm font-semibold text-navy">Build a steady routine</h3>
              <p className="mt-1 text-sm leading-6 text-navy/55">Aim for {dailyTarget} focused {dailyTarget === 1 ? "drill" : "drills"} a day. Progress matters more than collecting points.</p>
            </div>
          </li>
        </ol>

        <div className="flex flex-col-reverse gap-2 border-t border-navy/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={finish}
            className="min-h-11 rounded-lg px-4 text-sm font-semibold text-navy/60 transition-colors hover:bg-haze hover:text-navy active:bg-navy/[0.08]"
          >
            Not now
          </button>
          <a
            href="#practice-drills"
            onClick={finish}
            data-autofocus
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-700 active:bg-navy/85"
          >
            Choose a drill
          </a>
        </div>
      </div>
    </div>
  );
}
