"use client";

import { useState } from "react";
import type { LeaderRow, Player } from "@/lib/gamification";
import { Avatar } from "@/components/shell/Avatar";

const PREVIEW_ROWS = 5;

export function Leaderboard({ leaderboard, player }: { leaderboard: LeaderRow[]; player: Player }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = leaderboard.length > PREVIEW_ROWS;
  const visibleRows = expanded ? leaderboard : leaderboard.slice(0, PREVIEW_ROWS);

  return (
    <div className="overflow-hidden rounded-[14px] border border-navy/12 bg-white">
      <div className="flex items-center justify-between border-b border-navy/10 px-[18px] py-3.5">
        <h3 className="font-display text-[15px] font-bold text-navy">Weekly Leaderboard</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-navy/45">Resets Sun</span>
      </div>
      <div
        id="weekly-leaderboard-rows"
        className={expanded ? "max-h-[560px] overflow-y-auto overscroll-contain" : undefined}
      >
        {visibleRows.map((p) => (
          <div
            key={p.rank}
            className="flex items-center gap-[11px] px-[18px] py-[11px]"
            style={{
              borderTop: p.rank === 1 ? "none" : "1px solid rgba(11,42,91,0.07)",
              background: p.you ? "linear-gradient(90deg,rgba(63,169,245,0.1),rgba(63,169,245,0.02))" : "transparent",
            }}
          >
            <span
              className="w-[22px] text-center font-display text-sm font-extrabold"
              style={{ color: p.rank <= 3 ? "#f0a900" : "rgba(11,42,91,0.45)" }}
            >
              {p.rank}
            </span>
            <Avatar
              src={p.avatarUrl}
              initials={p.initials}
              alt={p.name}
              className="h-[30px] w-[30px] flex-none text-xs"
            />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{p.name}</span>
            <span className="font-display text-sm font-bold text-navy">{p.xp}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-navy/10 px-[18px] py-[11px] text-center text-xs text-navy/60">
        {player.xpBehindRival > 0 ? (
          <>
            You&apos;re <strong className="text-brand-600">#{player.rank}</strong> · {player.xpBehindRival} XP behind{" "}
            {player.rivalName}
          </>
        ) : (
          <>
            You&apos;re <strong className="text-brand-600">#{player.rank}</strong> · top of the board
          </>
        )}
      </div>
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="weekly-leaderboard-rows"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 border-t border-navy/10 bg-white px-[18px] py-2.5 text-xs font-bold text-brand-600 transition-colors duration-200 hover:bg-brand/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          {expanded ? `Show top ${PREVIEW_ROWS}` : `View all ${leaderboard.length} students`}
          <ChevronIcon expanded={expanded} />
        </button>
      ) : null}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
      fill="none"
    >
      <path
        d="m5.5 7.5 4.5 4.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
