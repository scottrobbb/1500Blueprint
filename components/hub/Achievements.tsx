"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type {
  AchievementCategory,
  AchievementCategorySummary,
  AchievementsView,
} from "@/lib/gamification";
import { ChevronRightIcon } from "@/components/shell/icons";

const CAT_COLOR: Record<AchievementCategory, string> = {
  xp: "#b78712",
  level: "#2a89c7",
  streak: "#b78712",
  drills: "#2f435f",
  tests: "#16a34a",
  goals: "#2a89c7",
  milestone: "#2f435f",
};

function CatIcon({
  cat,
  className,
  style,
}: {
  cat: AchievementCategory;
  className?: string;
  style?: CSSProperties;
}) {
  const base = { viewBox: "0 0 24 24", className, style, "aria-hidden": true as const };
  switch (cat) {
    case "xp":
      return (
        <svg {...base} fill="currentColor">
          <path d="M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3L12 21.5l-2.3-6.2-6.2-2.3 6.2-2.3z" />
        </svg>
      );
    case "level":
      return (
        <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 13l6-5 6 5M6 18l6-5 6 5" />
        </svg>
      );
    case "streak":
      return (
        <svg {...base} fill="currentColor">
          <path d="M12 3s5 3.5 5 8.5a5 5 0 0 1-10 0c0-1.6.6-2.8 1.3-3.6.2 1.2.9 1.9 1.7 2.1C9.4 7.8 12 6.3 12 3z" />
        </svg>
      );
    case "drills":
      return (
        <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 9v6M4 8.5v7M17.5 9v6M20 8.5v7M6.5 12h11" />
        </svg>
      );
    case "tests":
      return (
        <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-4 9 4-9 4-9-4z" />
          <path d="M7 11v4.3c0 1.3 10 1.3 10 0V11" />
          <path d="M21 9.4v3.6" />
        </svg>
      );
    case "goals":
      return (
        <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "milestone":
      return (
        <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4.5v1.5A2.5 2.5 0 0 0 7 10M17 6h2.5v1.5A2.5 2.5 0 0 1 17 10M9.5 14.5 9 18h6l-.5-3.5M8 20h8" />
        </svg>
      );
  }
}

function Medallion({ cat }: { cat: AchievementCategorySummary }) {
  const color = CAT_COLOR[cat.key];
  const active = cat.unlocked > 0;
  const complete = cat.total > 0 && cat.unlocked === cat.total;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className="relative flex h-12 w-12 items-center justify-center rounded-lg"
        style={{
          background: active ? `${color}1f` : "rgba(11,42,91,0.05)",
          boxShadow: active ? `inset 0 0 0 1.5px ${color}40` : "inset 0 0 0 1.5px rgba(11,42,91,0.08)",
        }}
      >
        <CatIcon cat={cat.key} className="h-7 w-7" style={{ color: active ? color : "rgba(11,42,91,0.3)" }} />
        {complete && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-success text-white">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      <div>
        <div
          className="text-[11px] font-semibold"
          style={{ color: active ? "#0b2a5b" : "rgba(11,42,91,0.4)" }}
        >
          {cat.label}
        </div>
        <div className="text-[11px] font-semibold text-navy/45">
          {cat.unlocked}/{cat.total}
        </div>
      </div>
    </div>
  );
}

export function Achievements({ data }: { data: AchievementsView }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-navy/12 bg-white">
      <div className="flex items-center justify-between border-b border-navy/10 px-[18px] py-3.5">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-navy">Achievements</h3>
          <div className="mt-0.5 text-xs text-navy/50">
            {data.unlocked} of {data.total} unlocked
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-[5px] rounded-lg border border-navy/20 bg-white px-[13px] py-1.5 text-[13px] font-semibold text-navy transition-colors hover:bg-navy/5"
        >
          Show all
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-[18px]">
        <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-7">
          {data.categories.map((cat) => (
            <Medallion key={cat.key} cat={cat} />
          ))}
        </div>

        {data.nextUp && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-lg border border-navy/10 bg-haze px-4 py-3 text-left transition-colors hover:border-navy/20"
          >
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
              style={{ background: `${CAT_COLOR[data.nextUp.category]}1f` }}
            >
              <CatIcon cat={data.nextUp.category} className="h-5 w-5" style={{ color: CAT_COLOR[data.nextUp.category] }} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-navy/45">Next achievement</div>
              <div className="truncate text-sm font-semibold text-navy">{data.nextUp.label}</div>
            </div>
            <div className="ml-auto hidden max-w-[45%] truncate text-right text-xs text-navy/55 sm:block">
              {data.nextUp.description}
            </div>
          </button>
        )}
      </div>

      {open && <AchievementsModal data={data} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AchievementsModal({ data, onClose }: { data: AchievementsView; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close achievements" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Achievements" className="relative z-10 flex max-h-[85vh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-xl bg-white sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-navy/10 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-extrabold text-navy">Achievements</h3>
            <div className="text-xs text-navy/50">
              {data.unlocked} of {data.total} unlocked
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-4">
          {data.categories.map((cat) => {
            const color = CAT_COLOR[cat.key];
            const items = data.items.filter((i) => i.category === cat.key);
            return (
              <div key={cat.key}>
                <div className="mb-2 flex items-center gap-2">
                  <CatIcon cat={cat.key} className="h-4 w-4" style={{ color }} />
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
                    {cat.label}
                  </h4>
                  <span className="text-xs text-navy/45">
                    {cat.unlocked}/{cat.total}
                  </span>
                  <span className="h-px flex-1 bg-navy/10" />
                </div>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        item.unlocked ? "border-navy/10 bg-white" : "border-navy/[0.07] bg-haze/60"
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-full"
                        style={{
                          background: item.unlocked ? `${color}1f` : "rgba(11,42,91,0.06)",
                          color: item.unlocked ? color : "rgba(11,42,91,0.3)",
                        }}
                      >
                        {item.unlocked ? (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold ${item.unlocked ? "text-navy" : "text-navy/55"}`}>
                          {item.label}
                        </div>
                        <div className="text-xs text-navy/50">{item.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
