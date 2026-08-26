import type { Player, StreakDay } from "@/lib/gamification";
import { FlameIcon } from "@/components/shell/icons";
import { Avatar } from "@/components/shell/Avatar";

type Props = {
  player: Player;
  weeklyStreak: StreakDay[];
  todayIndex: number;
  dailyGoal: { done: number; total: number };
};

export function StatsCard({ player, weeklyStreak, todayIndex, dailyGoal }: Props) {
  const levelPct = player.xpForNextLevel > 0 ? Math.floor((player.xp / player.xpForNextLevel) * 100) : 0;
  const xpToNextLevel = Math.max(0, player.xpForNextLevel - player.xp);
  const goalPct = dailyGoal.total > 0 ? Math.round((dailyGoal.done / dailyGoal.total) * 100) : 0;

  return (
    <div className="mx-auto mt-6 w-full max-w-[1120px] px-4 sm:px-6">
      <div className="grid overflow-hidden rounded-xl border border-navy/12 bg-white lg:grid-cols-3 lg:divide-x lg:divide-navy/10">
        <div className="flex min-w-0 items-center gap-3 p-5">
          <Avatar src={player.avatarUrl} initials={player.initials} alt={player.name} className="h-11 w-11 flex-none text-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3"><h2 className="truncate text-sm font-semibold text-navy">{player.name}</h2><span className="text-[10px] font-medium text-navy/45">Level {player.level}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/10"><div className="h-full rounded-full bg-brand" style={{ width: `${levelPct}%` }} /></div>
            <div className="mt-1.5 flex justify-between text-[10px] text-navy/45"><span>{player.xp.toLocaleString()} XP</span><span>{xpToNextLevel} to level {player.level + 1}</span></div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-navy/48">7 day activity</span><span className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy"><FlameIcon className="h-4 w-4 text-flag" />{player.streak} days</span></div>
          <div className="flex justify-between gap-1.5">
            {weeklyStreak.map((d, i) => {
              const done = d.done;
              const today = i === todayIndex;
              return (
                <div key={d.label} className="flex-1 text-center">
                  <div className={`mx-auto h-2.5 w-2.5 rounded-full ${done ? "bg-brand" : today ? "border-2 border-brand bg-white" : "bg-navy/12"}`} />
                  <div className="mt-2 text-[10px] font-medium text-navy/45">{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-navy/48">Daily goal</span><span className="font-display text-lg font-semibold tabular-nums text-navy">{dailyGoal.done} / {dailyGoal.total}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy/10"><div className="h-full rounded-full bg-success" style={{ width: `${goalPct}%` }} /></div>
          <p className="mt-2 text-[11px] text-navy/48">{dailyGoal.done >= dailyGoal.total ? "Goal complete" : `${dailyGoal.total - dailyGoal.done} drills remaining`}</p>
        </div>
      </div>
    </div>
  );
}
