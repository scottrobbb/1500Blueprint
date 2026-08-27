import type { Player, StreakDay } from "@/lib/gamification";
import { FlameIcon } from "@/components/shell/icons";
import { Avatar } from "@/components/shell/Avatar";

type Props = {
  player: Player;
  weeklyStreak: StreakDay[];
  todayIndex: number;
  dailyGoal: { done: number; total: number };
};

// Overlaps the banner by -58px. Four panels: avatar + XP, daily streak, daily goal.
export function StatsCard({ player, weeklyStreak, todayIndex, dailyGoal }: Props) {
  const levelPct = player.xpForNextLevel > 0 ? Math.floor((player.xp / player.xpForNextLevel) * 100) : 0;
  const xpToNextLevel = Math.max(0, player.xpForNextLevel - player.xp);
  const goalPct = dailyGoal.total > 0 ? Math.round((dailyGoal.done / dailyGoal.total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
      <div className="relative z-[2] -mt-10 flex flex-wrap items-center gap-4 rounded-2xl border border-navy/12 bg-white px-4 py-5 shadow-[0_12px_40px_rgba(7,25,59,0.12)] sm:-mt-[58px] sm:gap-6 sm:px-6 sm:py-[22px]">
        {/* avatar + level ring + XP bar */}
        <div className="flex min-w-[230px] flex-1 items-center gap-4">
          <div
            className="relative flex h-[78px] w-[78px] flex-none items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#3fa9f5 0% ${levelPct}%, rgba(11,42,91,0.12) ${levelPct}% 100%)` }}
          >
            <Avatar
              src={player.avatarUrl}
              initials={player.initials}
              alt={player.name}
              className="h-[66px] w-[66px] border-[3px] border-white text-2xl"
            />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white bg-navy px-2 py-0.5 font-display text-[10px] font-extrabold leading-none tracking-[0.05em] text-white">
              LVL {player.level}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-extrabold tracking-[-0.01em] text-navy">{player.name}</h2>
              <span className="rounded-[4px] border border-brand/30 bg-ice px-[7px] py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] text-brand-600">
                {player.plan}
              </span>
            </div>
            <div className="mt-[7px]">
              <div className="mb-[5px] flex justify-between text-[11px] font-semibold text-navy/55">
                <span>
                  {player.xp.toLocaleString()} / {player.xpForNextLevel.toLocaleString()} XP
                </span>
                <span>{xpToNextLevel} to Level {player.level + 1}</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-navy/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#3fa9f5,#2b8fe0)]"
                  style={{ width: `${levelPct}%` }}
                />
                <div className="absolute inset-0 w-10 animate-sheen bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)]" />
              </div>
            </div>
          </div>
        </div>

        <div className="hidden w-px self-stretch bg-navy/10 sm:block" />

        {/* daily streak week */}
        <div className="min-w-[210px] flex-1">
          <div className="mb-[9px] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-navy/45">Daily Streak</span>
            <span className="inline-flex items-center gap-[5px] font-display text-[17px] font-extrabold text-flag">
              <FlameIcon className="h-[18px] w-[18px] animate-flicker" />
              {player.streak}
            </span>
          </div>
          <div className="flex justify-between gap-1.5">
            {weeklyStreak.map((d, i) => {
              const done = d.done;
              const today = i === todayIndex;
              return (
                <div key={d.label} className="flex-1 text-center">
                  <div
                    className="mx-auto flex h-[26px] w-[26px] items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{
                      background: done ? "linear-gradient(135deg,#ffbd20,#f0a900)" : "transparent",
                      border: done ? "none" : today ? "2px dashed #3fa9f5" : "1.5px solid rgba(11,42,91,0.15)",
                    }}
                  >
                    {done ? "✓" : ""}
                  </div>
                  <div className="mt-[5px] text-[10px] font-semibold text-navy/50">{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden w-px self-stretch bg-navy/10 sm:block" />

        {/* daily goal ring */}
        <div className="flex min-w-[170px] items-center gap-3.5">
          <div
            className="relative flex h-[62px] w-[62px] flex-none items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#16a34a 0% ${goalPct}%, rgba(11,42,91,0.1) ${goalPct}% 100%)` }}
          >
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-white leading-none">
              <span className="font-display text-lg font-extrabold text-navy">{dailyGoal.done}</span>
              <span className="text-[9px] font-semibold text-navy/50">of {dailyGoal.total}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy/45">Daily Goal</div>
            <div className="mt-[3px] text-[13px] leading-[1.35] text-navy/70">
              {dailyGoal.done >= dailyGoal.total ? (
                <>Goal complete.
                  <br />
                  Flame secured 🔥</>
              ) : (
                <>{dailyGoal.total - dailyGoal.done} more drills
                  <br />
                  to keep the flame</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
