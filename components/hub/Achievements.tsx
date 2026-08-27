"use client";

import { useCallback, useState } from "react";
import type { AchievementItem, AchievementsView } from "@/lib/gamification";
import { ChevronRightIcon } from "@/components/shell/icons";
import { useModalA11y } from "./useModalA11y";

export function Achievements({ data }: { data: AchievementsView }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-navy/[0.035] active:bg-navy/[0.06]"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-navy/12 text-navy/60" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
            <path d="M7 6H4.5v1.5A2.5 2.5 0 0 0 7 10M17 6h2.5v1.5A2.5 2.5 0 0 1 17 10M9.5 14.5 9 18h6l-.5-3.5M8 20h8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
          <span className="block text-sm font-semibold text-navy">Achievements</span>
          <span className="block truncate text-xs text-navy/50">
            {data.unlocked} of {data.total} unlocked
            {data.nextUp ? ` — Next: ${data.nextUp.label}` : " — All complete"}
          </span>
        </span>
        <span className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-navy/60 group-hover:text-navy">
          View
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      </button>

      {open ? <AchievementsModal data={data} onClose={close} /> : null}
    </>
  );
}

function AchievementStatus({ item }: { item: AchievementItem }) {
  return (
    <span
      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border ${
        item.unlocked ? "border-success/25 bg-success-bg text-success-600" : "border-navy/10 bg-haze text-navy/35"
      }`}
      aria-hidden="true"
    >
      {item.unlocked ? (
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

function AchievementsModal({ data, onClose }: { data: AchievementsView; onClose: () => void }) {
  const dialogRef = useModalA11y(true, onClose);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close achievements"
        className="absolute inset-0 bg-navy/45"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievements-title"
        tabIndex={-1}
        className="relative z-10 flex max-h-[88dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-2xl border border-navy/12 bg-white sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-6 border-b border-navy/10 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 id="achievements-title" className="font-display text-xl font-bold tracking-[-0.015em] text-navy">
              Achievements
            </h2>
            <p className="mt-1 text-sm text-navy/55">
              {data.unlocked} of {data.total} unlocked
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close achievements"
            data-autofocus
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy active:bg-navy/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {data.nextUp ? (
          <div className="border-b border-navy/10 bg-haze/55 px-5 py-4 sm:px-6">
            <p className="text-xs font-medium text-navy/50">Your next achievement</p>
            <p className="mt-1 text-sm font-semibold text-navy">{data.nextUp.label}</p>
            <p className="mt-0.5 text-sm leading-5 text-navy/60">{data.nextUp.description}</p>
          </div>
        ) : null}

        <div className="overscroll-contain overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-7">
            {data.categories.map((category) => {
              const items = data.items.filter((item) => item.category === category.key);
              return (
                <section key={category.key} aria-labelledby={`achievement-category-${category.key}`}>
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h3 id={`achievement-category-${category.key}`} className="font-display text-base font-semibold text-navy">
                      {category.label}
                    </h3>
                    <span className="text-xs tabular-nums text-navy/50">
                      {category.unlocked} of {category.total}
                    </span>
                  </div>
                  <ul className="divide-y divide-navy/[0.07] border-y border-navy/[0.07]">
                    {items.map((item) => (
                      <li key={item.id} className="flex gap-3 py-3 [content-visibility:auto] [contain-intrinsic-size:0_56px]">
                        <AchievementStatus item={item} />
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${item.unlocked ? "text-navy" : "text-navy/55"}`}>
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-pretty text-xs leading-5 text-navy/50">{item.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
