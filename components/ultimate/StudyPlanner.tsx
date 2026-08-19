"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, DrillsIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";

type Props = { initialProfile: StudyPlannerProfile | null };

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sessions = [
  { label: "Targeted skill practice", meta: "15 minutes", href: "/ultimate/drills", Icon: DrillsIcon },
  { label: "Review recent mistakes", meta: "10 minutes", href: "/ultimate/history", Icon: HistoryIcon },
  { label: "Flashcard review", meta: "10–20 minutes", href: "/ultimate/flashcards", Icon: LayersIcon },
  { label: "Full-length simulation", meta: "2 hours 14 minutes", href: "/ultimate/tests", Icon: TestsIcon },
];

export function StudyPlanner({ initialProfile }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [setupOpen, setSetupOpen] = useState(!initialProfile);
  const week = useMemo(() => buildWeek(profile), [profile]);

  return (
    <div className="space-y-5">
      {profile ? (
        <section className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy/10 p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Your SAT plan</p>
              <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Build toward {profile.goalScore} by {formatDate(profile.testDate)}.</h2>
              <p className="mt-1 text-sm text-navy/50">
                {profile.currentScore ? `${profile.currentScore} current score · ` : "No current score yet · "}
                {profile.studyDays.length} study days per week
              </p>
            </div>
            <button type="button" onClick={() => setSetupOpen(true)} className="min-h-11 rounded-xl border border-navy/15 px-4 text-sm font-bold text-navy transition-colors hover:border-brand hover:text-brand">
              Edit plan settings
            </button>
          </div>
          <div className="divide-y divide-navy/10">
            {week.map((day) => (
              <div key={day.iso} className="flex gap-4 px-5 py-4 sm:px-6">
                <div className="w-11 flex-none text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-navy/40">{day.label}</span>
                  <strong className="font-display text-xl text-navy">{day.date}</strong>
                </div>
                {day.sessions.length ? (
                  <div className="min-w-0 flex-1 space-y-2">
                    {day.sessions.map((session) => (
                      <Link key={session.href} href={session.href} className="group flex min-h-11 items-center gap-3 rounded-xl bg-haze px-3 text-sm transition-colors hover:bg-ice">
                        <session.Icon className="h-4 w-4 flex-none text-brand-600" />
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{session.label}</span>
                        <span className="hidden text-xs text-navy/45 sm:block">{session.meta}</span>
                        <ChevronRightIcon className="h-4 w-4 text-navy/30 group-hover:text-brand" />
                      </Link>
                    ))}
                  </div>
                ) : <p className="pt-2 text-sm text-navy/40">Rest day</p>}
              </div>
            ))}
          </div>
          <p className="px-5 py-4 text-xs leading-5 text-navy/45 sm:px-6">This is a flexible practice rhythm for now. It will map to Scott&apos;s final course, bank, and drill catalog once all content is live.</p>
        </section>
      ) : (
        <section className="rounded-[18px] border border-dashed border-brand/35 bg-ice p-6 text-center sm:p-9">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Start here</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold text-navy">Set up your SAT plan.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-navy/55">Choose your test date, score target, and available days. You can change all of it later.</p>
          <button type="button" onClick={() => setSetupOpen(true)} className="mt-5 min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0]">Set up my plan</button>
        </section>
      )}

      {setupOpen ? <PlannerSetup profile={profile} onClose={() => profile && setSetupOpen(false)} onSave={(next) => { setProfile(next); setSetupOpen(false); }} /> : null}
    </div>
  );
}

function PlannerSetup({ profile, onClose, onSave }: { profile: StudyPlannerProfile | null; onClose: () => void; onSave: (profile: StudyPlannerProfile) => void }) {
  const [testDate, setTestDate] = useState(profile?.testDate ?? "");
  const [currentScore, setCurrentScore] = useState(profile?.currentScore?.toString() ?? "");
  const [noScoreYet, setNoScoreYet] = useState(profile ? profile.currentScore === null : true);
  const [goalScore, setGoalScore] = useState(profile?.goalScore?.toString() ?? "1500");
  const [studyDays, setStudyDays] = useState<number[]>(profile?.studyDays ?? [1, 2, 3, 4, 5]);
  const [practiceTestDay, setPracticeTestDay] = useState(profile?.practiceTestDay ?? 6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setStudyDays((days) => days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!testDate || !goalScore || studyDays.length === 0) { setError("Add a test date, goal score, and at least one study day."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/study-planner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testDate, currentScore: noScoreYet ? null : currentScore, goalScore, studyDays, practiceTestDay }),
      });
      const data = (await response.json()) as { profile?: StudyPlannerProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Could not save your plan.");
      onSave(data.profile);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your plan.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy/50 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="planner-setup-title">
      <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]">
        <div className="flex items-start justify-between gap-4 border-b border-navy/10 p-5 sm:p-7">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">{profile ? "Plan settings" : "Step 1 of 1"}</p><h2 id="planner-setup-title" className="mt-1 font-display text-2xl font-extrabold text-ink">Make your plan yours.</h2></div>
          {profile ? <button type="button" onClick={onClose} aria-label="Close planner settings" className="grid h-11 w-11 place-items-center rounded-xl text-xl text-navy/45 hover:bg-haze">×</button> : null}
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-7">
          <label className="block text-sm font-bold text-ink">When is your next SAT test?<input required type="date" min={today()} value={testDate} onChange={(event) => setTestDate(event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
          <label className="block text-sm font-bold text-ink">What score are you aiming for?<input required inputMode="numeric" min="400" max="1600" step="10" type="number" value={goalScore} onChange={(event) => setGoalScore(event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
          <div className="sm:col-span-2"><label className="block text-sm font-bold text-ink">What&apos;s your current SAT score? <span className="font-medium text-navy/45">Optional</span><input disabled={noScoreYet} inputMode="numeric" min="400" max="1600" step="10" type="number" value={currentScore} onChange={(event) => setCurrentScore(event.target.value)} placeholder="For example, 1240" className="mt-2 block min-h-12 w-full rounded-xl border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-brand focus:ring-2 focus:ring-brand/20" /></label><label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium text-navy/70"><input checked={noScoreYet} type="checkbox" onChange={(event) => setNoScoreYet(event.target.checked)} className="h-4 w-4 rounded border-navy/25 accent-brand" />I haven&apos;t taken a test yet</label></div>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-bold text-ink">Which days can you study?</legend><div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => toggleDay(day)} aria-pressed={studyDays.includes(day)} className={`min-h-12 rounded-xl text-xs font-bold transition-colors ${studyDays.includes(day) ? "bg-brand text-white" : "bg-fill text-navy/55 hover:bg-ice"}`}>{label}</button>)}</div></fieldset>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-bold text-ink">Preferred full-test day</legend><div className="mt-3 flex flex-wrap gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => setPracticeTestDay(day)} aria-pressed={practiceTestDay === day} className={`min-h-11 rounded-full px-4 text-sm font-bold transition-colors ${practiceTestDay === day ? "bg-navy text-white" : "border border-navy/15 text-navy/60 hover:border-brand"}`}>{label}</button>)}</div></fieldset>
          {error ? <p role="alert" className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-navy/10 p-5 sm:px-7">{profile ? <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-bold text-navy/55">Cancel</button> : null}<button disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Saving…" : profile ? "Update plan" : "Create my plan"}</button></div>
      </form>
    </div>
  );
}

function buildWeek(profile: StudyPlannerProfile | null) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start); date.setDate(start.getDate() + offset);
    const isStudyDay = profile?.studyDays.includes(offset) ?? false;
    const session = offset === profile?.practiceTestDay ? sessions[3] : sessions[offset % 3];
    return { iso: date.toISOString(), label: dayLabels[offset], date: date.getDate(), sessions: isStudyDay ? [session] : [] };
  });
}

function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function today() { return new Date().toISOString().slice(0, 10); }
