"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { HubState } from "@/lib/gamification/state";
import { levelProgress } from "@/lib/gamification/engine";
import { MAX_DAILY_GOAL, MIN_DAILY_GOAL } from "@/lib/settings/progress";

export function ProgressSettingsView({ progress }: { progress: HubState }) {
  const router = useRouter();
  const level = levelProgress(progress.player.xp);
  const [savedGoal, setSavedGoal] = useState(progress.dailyGoal.total);
  const [dailyGoal, setDailyGoal] = useState(progress.dailyGoal.total);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveDailyGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/settings/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyGoal }),
      });
      const body = (await response.json().catch(() => null)) as
        | { dailyGoal?: number; error?: string }
        | null;
      if (!response.ok || typeof body?.dailyGoal !== "number") {
        throw new Error(body?.error ?? "Could not save your daily goal.");
      }
      setSavedGoal(body.dailyGoal);
      setDailyGoal(body.dailyGoal);
      setMessage("Daily goal updated.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your daily goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="xp-heading">
        <h2 id="xp-heading" className="font-display text-lg font-extrabold text-navy">XP</h2>
        <div className="mt-4 rounded-2xl border-2 border-navy/10 bg-white p-5 sm:p-6">
          <div className="flex items-end justify-between gap-5">
            <p className="font-display text-3xl font-extrabold tracking-[-0.03em] text-navy">
              {progress.player.xp.toLocaleString()} <span className="text-base font-bold text-navy/45">XP</span>
            </p>
            <p className="text-sm font-extrabold text-navy">Level {level.level}</p>
          </div>
          <div
            className="mt-5 h-2 overflow-hidden rounded-full bg-navy/[0.08]"
            role="progressbar"
            aria-label={`Progress to level ${level.level + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={level.pct}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${level.pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-4 text-xs font-semibold text-navy/45">
            <span>{(progress.player.xp - level.floor).toLocaleString()} of {(level.ceil - level.floor).toLocaleString()} XP</span>
            <span>{level.toNext.toLocaleString()} XP to level {level.level + 1}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="weekly-activity-heading">
        <h2 id="weekly-activity-heading" className="font-display text-lg font-extrabold text-navy">Activity</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <h3 className="text-sm font-extrabold text-navy">This week</h3>
            <span className="text-xs font-semibold text-navy/45">
              {progress.weeklyStreak.filter((day) => day.done).length} of 7 goals met
            </span>
          </div>
          <div className="grid grid-cols-7 divide-x-2 divide-navy/[0.07] border-t-2 border-navy/[0.07] px-3 py-4 sm:px-5">
              {progress.weeklyStreak.map((day, index) => (
                <div key={day.label} className={`text-center ${index === progress.todayIndex ? "text-brand-600" : "text-navy"}`}>
                  <span className="block text-[11px] font-bold text-navy/45">{day.label}</span>
                  <span className="mt-2 flex h-5 items-center justify-center text-sm font-extrabold" aria-label={`${day.xp} XP`}>
                    {day.done ? <CheckIcon /> : day.xp > 0 ? day.xp : "—"}
                  </span>
                </div>
              ))}
          </div>
          <div className="border-t-2 border-navy/[0.07] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy">Daily goal</h3>
                <p className="mt-1 text-sm font-semibold text-navy/50">
                  {progress.dailyGoal.done} of {savedGoal} drills completed today
                </p>
              </div>
              <form onSubmit={saveDailyGoal} className="flex items-end gap-2">
                <label>
                  <span className="block text-xs font-bold text-navy/55">Drills per day</span>
                  <input
                    type="number"
                    min={MIN_DAILY_GOAL}
                    max={MAX_DAILY_GOAL}
                    step={1}
                    required
                    value={dailyGoal}
                    disabled={saving}
                    onChange={(event) => setDailyGoal(Number(event.target.value))}
                    className="mt-1.5 h-10 w-20 rounded-lg border-2 border-navy/10 bg-white px-3 text-sm font-bold text-navy outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || dailyGoal === savedGoal}
                  className="h-10 rounded-lg bg-navy px-4 text-sm font-bold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-navy/10 disabled:text-navy/35"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </form>
            </div>
            {error || message ? (
              <p aria-live="polite" className={`mt-3 text-xs font-semibold ${error ? "text-danger-600" : "text-success-600"}`}>
                {error ?? message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="achievements-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="achievements-heading" className="font-display text-lg font-extrabold text-navy">Achievements</h2>
          <span className="text-xs font-semibold text-navy/45">
            {progress.achievements.unlocked} of {progress.achievements.total} unlocked
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
          {progress.achievements.nextUp ? (
            <div className="px-5 py-4 sm:px-6">
              <span className="text-xs font-semibold text-navy/45">Next achievement</span>
              <h3 className="mt-1 text-sm font-extrabold text-navy">{progress.achievements.nextUp.label}</h3>
              <p className="mt-1 text-sm text-navy/55">{progress.achievements.nextUp.description}</p>
            </div>
          ) : (
            <p className="px-5 py-4 text-sm font-bold text-success-600 sm:px-6">All achievements unlocked</p>
          )}
          <div className="grid grid-cols-2 border-t-2 border-navy/[0.07] sm:grid-cols-4 lg:grid-cols-7">
            {progress.achievements.categories.map((category, index) => (
              <div
                key={category.key}
                className={`px-4 py-3 ${index > 0 ? "border-l-2 border-navy/[0.07]" : ""}`}
              >
                <p className="text-xs font-semibold text-navy/45">{category.label}</p>
                <p className="mt-1 text-sm font-extrabold text-navy">{category.unlocked} / {category.total}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m4 10 3.5 3.5L16 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
