"use client";

import { useState } from "react";

export function PlannerScorePrompt({ attemptId, score }: { attemptId: string; score: number }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(String(score));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function save(useTestScore: boolean) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/study-planner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentScore: useTestScore ? score : value, scorePromptAttemptId: attemptId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update your score.");
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your score.");
    } finally { setBusy(false); }
  }

  async function dismiss() {
    setBusy(true);
    try {
      const response = await fetch("/api/study-planner/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scorePromptAttemptId: attemptId }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not dismiss this update.");
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not dismiss this update.");
    } finally { setBusy(false); }
  }

  return (
    <section className="mb-6 rounded-2xl border border-[#8cc7fb] bg-[#edf8ff] p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-brand-600">Update your study plan</p>
        <h2 className="mt-1 font-display text-lg font-extrabold text-navy">Should we use this {score} as your current SAT score?</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">This helps keep your score target visible in your Study Planner. You can change it there anytime.</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
        <label className="sr-only" htmlFor={`planner-score-${attemptId}`}>Current SAT score</label>
        <input id={`planner-score-${attemptId}`} inputMode="numeric" min="400" max="1600" step="10" type="number" value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 w-24 rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-navy outline-none focus:border-brand-600 focus:ring-2 focus:ring-blue-200" />
        <button type="button" disabled={busy} onClick={() => void save(false)} className="min-h-11 rounded-lg border border-blue-200 bg-white px-4 text-sm font-bold text-navy hover:border-brand-600 disabled:opacity-60">Save edit</button>
        <button type="button" disabled={busy} onClick={() => void save(true)} className="min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white hover:bg-navy disabled:opacity-60">Use {score}</button>
        <button type="button" disabled={busy} onClick={() => void dismiss()} className="min-h-11 px-2 text-sm font-semibold text-slate-500 hover:text-navy disabled:opacity-60">Not now</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p> : null}
    </section>
  );
}
