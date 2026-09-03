"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";
import { upcomingSatDates } from "@/lib/study-planner/sat-dates";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATION_OPTIONS = [30, 45, 60, 90];
const WIZARD_STEPS = ["Test and score", "Weekly schedule", "Full practice tests"];

type Props = {
  enabled: boolean;
  profile: StudyPlannerProfile | null;
  plan: string;
};

export function StudyPreferencesForm({ enabled, profile, plan }: Props) {
  if (!enabled) return <LockedPlanner plan={plan} />;
  return <PlannerForm initialProfile={profile} />;
}

function PlannerForm({ initialProfile }: { initialProfile: StudyPlannerProfile | null }) {
  const router = useRouter();
  const today = useMemo(() => todayInNewYork(), []);
  const fallbackDate = useMemo(() => upcomingSatDates(today)[0] ?? today, [today]);
  const validSavedDate = initialProfile?.testDate && initialProfile.testDate >= today
    ? initialProfile.testDate
    : fallbackDate;

  const [profile, setProfile] = useState(initialProfile);
  const [testDate, setTestDate] = useState(validSavedDate);
  const [finishBy, setFinishBy] = useState(
    initialProfile?.finishBy && initialProfile.finishBy >= today ? initialProfile.finishBy : "",
  );
  const [currentScore, setCurrentScore] = useState(initialProfile?.currentScore?.toString() ?? "");
  const [goalScore, setGoalScore] = useState(initialProfile?.goalScore?.toString() ?? "1500");
  const [studyDays, setStudyDays] = useState<number[]>(initialProfile?.studyDays ?? [1, 2, 3, 4, 5]);
  const [practiceTestDay, setPracticeTestDay] = useState(initialProfile?.practiceTestDay ?? 6);
  const [dailyMinutes, setDailyMinutes] = useState(initialProfile?.dailyMinutes ?? 45);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  function toggleStudyDay(day: number) {
    setStudyDays((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day].sort((a, b) => a - b));
  }

  function validationErrorForStep(stepToValidate: number): string | null {
    if (stepToValidate === 0) {
      if (!testDate || testDate < today) return "Choose an upcoming SAT date.";

      const goal = Number(goalScore);
      if (!Number.isInteger(goal) || goal < 400 || goal > 1600) {
        return "Enter a goal score from 400 to 1600.";
      }

      if (currentScore !== "") {
        const current = Number(currentScore);
        if (!Number.isInteger(current) || current < 400 || current > 1600) {
          return "Enter a current score from 400 to 1600, or leave it blank.";
        }
      }
    }

    if (stepToValidate === 1) {
      if (studyDays.length === 0) return "Choose at least one study day.";
      if (finishBy && (finishBy < today || finishBy > testDate)) {
        return "Your finish date has to fall between today and your SAT date.";
      }
    }

    return null;
  }

  function continueWizard() {
    const validationError = validationErrorForStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setMessage(null);
    setStep((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setMessage(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const validationError = validationErrorForStep(0) ?? validationErrorForStep(1);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/study-planner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testDate,
          finishBy: finishBy || null,
          currentScore: currentScore === "" ? null : Number(currentScore),
          goalScore: Number(goalScore),
          studyDays,
          practiceTestDay,
          dailyMinutes,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { profile?: StudyPlannerProfile; error?: string }
        | null;
      if (!response.ok || !body?.profile) {
        throw new Error(body?.error ?? "Could not save your study preferences.");
      }
      setProfile(body.profile);
      setMessage("Study preferences updated.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your study preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
      <div className="border-b-2 border-navy/[0.07] px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-extrabold text-navy">{WIZARD_STEPS[step]}</span>
          <span className="text-xs font-semibold text-navy/45">Step {step + 1} of {WIZARD_STEPS.length}</span>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-navy/[0.07]" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${((step + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {step === 0 ? (
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">When is your test?</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-extrabold text-navy">SAT date</span>
                <input
                  type="date"
                  min={today}
                  required
                  value={testDate}
                  disabled={saving}
                  onChange={(event) => setTestDate(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border-2 border-navy/10 bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-navy">Current score <span className="font-semibold text-navy/42">(optional)</span></span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={400}
                  max={1600}
                  step={10}
                  value={currentScore}
                  disabled={saving}
                  onChange={(event) => setCurrentScore(event.target.value)}
                  placeholder="No baseline score"
                  className="mt-2 block h-11 w-full rounded-xl border-2 border-navy/10 bg-white px-4 text-sm font-semibold text-ink outline-none placeholder:text-navy/30 focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-navy">Goal score</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={400}
                  max={1600}
                  step={10}
                  required
                  value={goalScore}
                  disabled={saving}
                  onChange={(event) => setGoalScore(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border-2 border-navy/10 bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
                />
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">Build your weekly schedule</h2>
            <fieldset className="mt-6">
              <legend className="text-sm font-extrabold text-navy">How long can you study each day?</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DURATION_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={saving}
                    aria-pressed={dailyMinutes === minutes}
                    onClick={() => setDailyMinutes(minutes)}
                    className={`h-11 rounded-xl border-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${dailyMinutes === minutes ? "border-brand bg-brand text-white" : "border-navy/10 text-navy/55 hover:border-brand/30"}`}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-8 block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-extrabold text-navy">Finish studying by</span>
                {finishBy ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setFinishBy("")}
                    className="text-xs font-bold text-brand-600 transition-colors hover:text-brand disabled:opacity-50"
                  >
                    Use my SAT date
                  </button>
                ) : null}
              </span>
              <input
                type="date"
                min={today}
                max={testDate}
                value={finishBy}
                disabled={saving}
                onChange={(event) => setFinishBy(event.target.value)}
                className="mt-3 block h-11 w-full rounded-xl border-2 border-navy/10 bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
              />
              <span className="mt-2 block text-xs font-semibold text-navy/45">
                Set a date before your SAT and the plan compresses so every required lesson and skill lands before it.
              </span>
            </label>

            <fieldset className="mt-8">
              <legend className="text-sm font-extrabold text-navy">Which days can you study?</legend>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    disabled={saving}
                    aria-pressed={studyDays.includes(day)}
                    onClick={() => toggleStudyDay(day)}
                    className={`h-11 rounded-xl border-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${studyDays.includes(day) ? "border-navy bg-navy text-white" : "border-navy/10 text-navy/50 hover:border-navy/25"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">Choose a full-test day</h2>
            <fieldset className="mt-6">
              <legend className="text-sm font-extrabold text-navy">Which day works best?</legend>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    disabled={saving}
                    aria-pressed={practiceTestDay === day}
                    onClick={() => setPracticeTestDay(day)}
                    className={`h-11 rounded-xl border-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${practiceTestDay === day ? "border-brand bg-brand text-white" : "border-navy/10 text-navy/50 hover:border-brand/30"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-8 border-t-2 border-navy/[0.07] pt-6">
              <h3 className="text-sm font-extrabold text-navy">Review</h3>
              <dl className="mt-3 divide-y-2 divide-navy/[0.07] border-y-2 border-navy/[0.07]">
                <ReviewRow label="SAT date" value={formatShortDate(testDate)} />
                <ReviewRow label="Finish studying by" value={finishBy ? formatShortDate(finishBy) : "SAT date"} />
                <ReviewRow label="Score" value={`${currentScore || "No baseline"} → ${goalScore}`} />
                <ReviewRow label="Study schedule" value={`${dailyMinutes} min · ${studyDays.map((day) => DAY_LABELS[day]).join(", ")}`} />
                <ReviewRow label="Full-test day" value={DAY_LABELS[practiceTestDay]} />
              </dl>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t-2 border-navy/[0.07] bg-haze/45 px-5 py-4 sm:px-7">
        {error || message ? (
          <p aria-live="polite" className={`mb-3 text-xs font-semibold ${error ? "text-danger-600" : "text-success-600"}`}>
            {error ?? message}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div>
            {step > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={goBack}
                className="h-10 rounded-lg px-3 text-sm font-bold text-navy/55 transition-colors hover:bg-navy/[0.05] hover:text-navy disabled:opacity-50"
              >
                Back
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {profile && step === WIZARD_STEPS.length - 1 ? (
              <Link href="/ultimate/planner" className="inline-flex h-10 items-center justify-center rounded-lg border-2 border-navy/10 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand/30 hover:text-brand-600">
                View planner
              </Link>
            ) : null}
            {step < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={continueWizard}
                className="h-10 rounded-lg bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-navy-700"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-lg bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-wait disabled:opacity-55"
              >
                {saving ? "Saving…" : profile ? "Save preferences" : "Create study plan"}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 py-3">
      <dt className="text-sm font-semibold text-navy/50">{label}</dt>
      <dd className="text-right text-sm font-bold text-navy">{value}</dd>
    </div>
  );
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function LockedPlanner({ plan }: { plan: string }) {
  return (
    <section className="rounded-2xl border-2 border-navy/10 bg-white p-6 sm:p-7">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-ice text-brand-600"><LockIcon /></span>
      <h2 className="mt-5 font-display text-xl font-extrabold text-navy">Study preferences require Max</h2>
      <p className="mt-2 text-sm font-semibold text-navy/48">Current plan: <span className="capitalize text-navy">{plan}</span></p>
      <Link href="/pricing" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600">
        View plans
      </Link>
    </section>
  );
}

function todayInNewYork(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" strokeLinecap="round" /></svg>;
}
