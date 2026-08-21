"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import type { StudyPlan, StudyPlanTask } from "@/lib/study-planner/plan";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";

type Props = {
  initialProfile: StudyPlannerProfile | null;
  initialPlan: StudyPlan | null;
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const durationOptions = [30, 45, 60, 90];

export function StudyPlanner({ initialProfile, initialPlan }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [plan, setPlan] = useState(initialPlan);
  const [setupOpen, setSetupOpen] = useState(!initialProfile);
  const [retuning, setRetuning] = useState(false);
  const [retuneError, setRetuneError] = useState<string | null>(null);

  const today = todayInNewYork();
  const profileExpired = profile !== null && profile.testDate < today;
  const nextTask = plan?.tasks.find((task) => !task.completed && task.date <= today)
    ?? plan?.tasks.find((task) => !task.completed)
    ?? null;

  async function retunePlan() {
    setRetuning(true);
    setRetuneError(null);
    try {
      const response = await fetch("/api/study-planner/plan", { method: "POST" });
      const body = (await response.json()) as { plan?: StudyPlan; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error ?? "Could not retune your plan.");
      setPlan(body.plan);
      router.refresh();
    } catch (reason) {
      setRetuneError(reason instanceof Error ? reason.message : "Could not retune your plan.");
    } finally {
      setRetuning(false);
    }
  }

  return (
    <div className="space-y-5">
      {profileExpired && profile ? (
        <ExpiredPlan profile={profile} onEdit={() => setSetupOpen(true)} />
      ) : plan && profile ? (
        <>
          <ScoreRunway plan={plan} nextTask={nextTask} />

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <PlanSchedule plan={plan} today={today} />
            <aside className="space-y-5 lg:sticky lg:top-6">
              <FocusPanel plan={plan} />
              <section className="rounded-[18px] border border-navy/10 bg-white p-5 shadow-pop">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Plan controls</p>
                <h2 className="mt-1 font-display text-lg font-extrabold text-navy">Keep it honest.</h2>
                <p className="mt-2 text-sm leading-6 text-navy/50">Retune after a score change, a missed day, or a strong practice session. Completed work stays in your learning history.</p>
                <div className="mt-4 grid gap-2">
                  <button type="button" disabled={retuning} onClick={() => void retunePlan()} className="min-h-11 cursor-pointer rounded-xl bg-navy px-4 text-sm font-extrabold text-white transition-colors hover:bg-navy-700 disabled:cursor-wait disabled:opacity-60">
                    {retuning ? "Reading your progress…" : "Retune from my progress"}
                  </button>
                  <button type="button" onClick={() => setSetupOpen(true)} className="min-h-11 cursor-pointer rounded-xl border border-navy/15 px-4 text-sm font-bold text-navy transition-colors hover:border-brand/45 hover:text-brand-600">
                    Edit schedule and goal
                  </button>
                </div>
                {retuneError ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-xs font-semibold text-danger-600">{retuneError}</p> : null}
                <p className="mt-4 border-t border-navy/10 pt-4 text-[11px] leading-5 text-navy/40">Generated {formatTimestamp(plan.generatedAt)} from your latest course, bank, and test activity.</p>
              </section>
            </aside>
          </div>
        </>
      ) : profile ? (
        <section className="grid min-h-72 place-items-center rounded-[20px] border border-dashed border-brand/35 bg-ice px-6 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-600"><CalendarIcon className="h-6 w-6" /></span>
            <h2 className="mt-4 font-display text-2xl font-extrabold text-navy">Your schedule needs a fresh read.</h2>
            <p className="mt-2 text-sm leading-6 text-navy/50">Generate a new week from your current lessons, practice accuracy, and test history.</p>
            <button type="button" disabled={retuning} onClick={() => void retunePlan()} className="mt-5 min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white disabled:opacity-60">{retuning ? "Building…" : "Build my week"}</button>
          </div>
        </section>
      ) : (
        <PlannerBlankState onStart={() => setSetupOpen(true)} />
      )}

      {setupOpen ? (
        <PlannerSetup
          profile={profile}
          onClose={() => profile && setSetupOpen(false)}
          onSave={(nextProfile, nextPlan) => {
            setProfile(nextProfile);
            if (nextPlan) setPlan(nextPlan);
            setSetupOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ExpiredPlan({ profile, onEdit }: { profile: StudyPlannerProfile; onEdit: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(125deg,#0b2a5b,#174778)] p-7 text-white shadow-[0_22px_60px_-40px_rgba(11,42,91,0.95)] sm:p-10">
      <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[38px] border-sky/[0.08]" />
      <div className="relative max-w-2xl">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-sky"><CalendarIcon className="h-6 w-6" /></span>
        <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-sky">Plan complete</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.035em]">Choose the next test day.</h2>
        <p className="mt-3 text-sm leading-6 text-white/62">Your {formatDate(profile.testDate)} SAT date has passed. Add the next date and the planner will rebuild from everything you learned—not start you over.</p>
        <button type="button" onClick={onEdit} className="mt-6 min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#2b8fe0] hover:bg-[#4db2f8]">Set my next SAT date</button>
      </div>
    </section>
  );
}

function ScoreRunway({ plan, nextTask }: { plan: StudyPlan; nextTask: StudyPlanTask | null }) {
  const phase = phaseCopy(plan.phase);
  const scoreProgress = plan.currentScore == null
    ? 0
    : Math.max(0, Math.min(100, ((plan.currentScore - 400) / Math.max(1, plan.goalScore - 400)) * 100));

  return (
    <section className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(125deg,#0b2a5b,#174778)] text-white shadow-[0_22px_60px_-40px_rgba(11,42,91,0.95)]">
      <div aria-hidden="true" className="absolute -right-16 -top-28 h-72 w-72 rounded-full border-[44px] border-sky/[0.08]" />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky/20 bg-sky/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-sky">{phase.label}</span>
            <span className="text-xs font-semibold text-white/45">{plan.daysToTest} {plan.daysToTest === 1 ? "day" : "days"} to test day</span>
          </div>
          <h2 className="mt-4 max-w-2xl font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[38px]">{phase.headline}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">{phase.description}</p>

          <div className="mt-6 max-w-2xl rounded-[16px] border border-white/10 bg-white/[0.07] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/42">Current signal</span>
                <strong className="mt-1 block font-display text-2xl font-extrabold">{plan.currentScore?.toLocaleString() ?? "Baseline needed"}</strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-sky">Goal</span>
                <strong className="mt-1 block font-display text-2xl font-extrabold text-sky">{plan.goalScore.toLocaleString()}</strong>
              </div>
            </div>
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/12">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#3fa9f5,#7ccbff)] transition-[width]" style={{ width: `${scoreProgress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-white/35">
              <span>{plan.scoreGap == null ? "Take a baseline test to measure the gap" : `${plan.scoreGap.toLocaleString()} points to close`}</span>
              <span>{formatDate(plan.endsOn)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-white/10 bg-white/[0.08] p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">This plan</p>
              <strong className="mt-1 block font-display text-3xl font-extrabold">{plan.progress.percent}%</strong>
            </div>
            <ProgressRing value={plan.progress.percent} />
          </div>
          <p className="mt-3 text-xs font-semibold text-white/50">{plan.progress.completed} of {plan.progress.target} assignments complete · {formatMinutes(plan.totalMinutes)}</p>
          {nextTask ? (
            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky">Next move</p>
              <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5">{nextTask.title}</h3>
              <Link href={nextTask.href} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#4db2f8]">
                {nextTask.progress.completed > 0 ? "Continue assignment" : "Start assignment"}<ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <p className="mt-5 border-t border-white/10 pt-5 text-sm font-semibold text-sky">Week complete. Retune when you are ready for the next block.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PlanSchedule({ plan, today }: { plan: StudyPlan; today: string }) {
  const days = useMemo(() => dateRange(plan.startsOn, plan.endsOn).map((date) => ({
    date,
    tasks: plan.tasks.filter((task) => task.date === date).sort((a, b) => a.position - b.position),
  })), [plan]);

  return (
    <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-pop">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-navy/10 px-5 py-5 sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Your next seven days</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Do the work in this order.</h2>
        </div>
        <span className="rounded-full bg-haze px-3 py-1.5 text-xs font-bold text-navy/45">{formatDate(plan.startsOn)}–{formatDate(plan.endsOn)}</span>
      </header>

      <ol className="divide-y divide-navy/10">
        {days.map(({ date, tasks }) => {
          const isToday = date === today;
          const overdue = date < today && tasks.some((task) => !task.completed);
          return (
            <li key={date} className={`grid gap-4 px-5 py-5 sm:grid-cols-[78px_minmax(0,1fr)] sm:px-6 ${isToday ? "bg-ice/35" : ""}`}>
              <div>
                <span className={`text-[10px] font-extrabold uppercase tracking-[0.13em] ${isToday ? "text-brand-600" : "text-navy/35"}`}>{isToday ? "Today" : formatWeekday(date)}</span>
                <strong className="mt-0.5 block font-display text-xl font-extrabold text-navy">{formatMonthDay(date)}</strong>
                {overdue ? <span className="mt-1 block text-[10px] font-bold text-flag">Carry over</span> : null}
              </div>
              {tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => <PlanTaskCard key={task.id} task={task} />)}
                </div>
              ) : (
                <div className="flex min-h-16 items-center rounded-xl border border-dashed border-navy/10 px-4 text-sm font-medium text-navy/35">
                  {date === plan.testDate ? "SAT test day — trust the system you built." : "Recovery day — let the work stick."}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlanTaskCard({ task }: { task: StudyPlanTask }) {
  const label = taskLabel(task.kind);
  return (
    <article className={`group rounded-[16px] border p-4 transition-colors ${task.completed ? "border-success/20 bg-success-bg/55" : "border-navy/10 bg-white hover:border-brand/30"}`}>
      <div className="flex items-start gap-3.5">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${task.completed ? "bg-success text-white" : "bg-ice text-brand-600"}`}>
          {task.completed ? <CheckIcon className="h-5 w-5" /> : <TaskIcon kind={task.kind} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-brand-600">{label}</span>
            <span className="text-[10px] font-semibold text-navy/35">{task.estimatedMinutes} min{task.section ? ` · ${task.section === "math" ? "Math" : "Reading & Writing"}` : ""}</span>
          </div>
          <h3 className="mt-1 text-sm font-extrabold leading-5 text-ink sm:text-[15px]">{task.title}</h3>
          <p className="mt-1 text-xs leading-5 text-navy/50">{task.description}</p>
          <p className="mt-2 text-[11px] font-semibold leading-4 text-navy/42">Why this: {task.reason}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <TaskProgress task={task} />
            {task.completed ? (
              <span className="ml-auto inline-flex min-h-9 items-center gap-1.5 text-xs font-extrabold text-success-600"><CheckIcon className="h-4 w-4" /> Complete</span>
            ) : (
              <Link href={task.href} className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-navy px-3.5 text-xs font-extrabold text-white transition-colors hover:bg-brand-600">
                {task.progress.completed > 0 ? "Continue" : "Start"}<ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskProgress({ task }: { task: StudyPlanTask }) {
  const text = task.kind === "course_lesson"
    ? task.completed ? "Lesson completed" : "Finish the assigned lesson"
    : task.kind === "full_test"
      ? task.completed ? "Full test completed" : "Complete one full test"
      : `${task.progress.completed}/${task.progress.target} questions checked`;
  return (
    <div className="min-w-[150px] flex-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-navy/[0.07]"><div className={`h-full rounded-full ${task.completed ? "bg-success" : "bg-brand"}`} style={{ width: `${task.progress.percent}%` }} /></div>
      <p className="mt-1.5 text-[10px] font-bold text-navy/40">{text}</p>
    </div>
  );
}

function FocusPanel({ plan }: { plan: StudyPlan }) {
  return (
    <section className="rounded-[18px] border border-navy/10 bg-white p-5 shadow-pop">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Why this week</p>
      <h2 className="mt-1 font-display text-lg font-extrabold text-navy">Your highest-leverage skills</h2>
      {plan.focusAreas.length > 0 ? (
        <ol className="mt-4 space-y-4">
          {plan.focusAreas.slice(0, 3).map((focus, index) => (
            <li key={`${focus.section}-${focus.skill}`} className="flex gap-3">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-navy text-[11px] font-extrabold text-white">{index + 1}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-ink">{focus.skill}</strong>
                  <span className="text-[10px] font-bold text-navy/35">{focus.section === "math" ? "Math" : "R&W"}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-navy/48">{focus.reason}</p>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-navy/40">
                  <span>{focus.accuracy == null ? "Baseline needed" : `${focus.accuracy}% accuracy`}</span>
                  <span aria-hidden="true">·</span>
                  <span>{focus.attempts} attempts</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm leading-6 text-navy/50">Complete a Question Bank session and your next plan will target the clearest weaknesses.</p>
      )}
      <div className="mt-5 rounded-xl bg-ice/70 p-3 text-[11px] font-semibold leading-5 text-navy/50">The planner treats lessons as instruction and checked questions as evidence. It will not mark a skill mastered because you opened a page.</div>
    </section>
  );
}

function PlannerBlankState({ onStart }: { onStart: () => void }) {
  return (
    <section className="rounded-[20px] border border-dashed border-brand/35 bg-ice p-7 text-center sm:p-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm"><CalendarIcon className="h-7 w-7" /></span>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">Max study planner</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.035em] text-navy">Give every study day a job.</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-navy/55">Set your test date, score target, and real availability. We will turn your current performance into a seven-day learn → practice → test loop.</p>
      <button type="button" onClick={onStart} className="mt-6 min-h-11 cursor-pointer rounded-xl bg-brand px-6 text-sm font-extrabold text-white shadow-[0_2px_0_#2b8fe0]">Build my plan</button>
    </section>
  );
}

function PlannerSetup({ profile, onClose, onSave }: { profile: StudyPlannerProfile | null; onClose: () => void; onSave: (profile: StudyPlannerProfile, plan: StudyPlan | null) => void }) {
  const [testDate, setTestDate] = useState(profile?.testDate ?? "");
  const [currentScore, setCurrentScore] = useState(profile?.currentScore?.toString() ?? "");
  const [noScoreYet, setNoScoreYet] = useState(profile ? profile.currentScore === null : true);
  const [goalScore, setGoalScore] = useState(profile?.goalScore?.toString() ?? "1500");
  const [studyDays, setStudyDays] = useState<number[]>(profile?.studyDays ?? [1, 2, 3, 4, 5]);
  const [practiceTestDay, setPracticeTestDay] = useState(profile?.practiceTestDay ?? 6);
  const [dailyMinutes, setDailyMinutes] = useState(profile?.dailyMinutes ?? 45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setStudyDays((days) => days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!testDate || !goalScore || studyDays.length === 0) {
      setError("Add a test date, goal score, and at least one study day.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/study-planner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testDate, currentScore: noScoreYet ? null : currentScore, goalScore, studyDays, practiceTestDay, dailyMinutes }),
      });
      const data = (await response.json()) as { profile?: StudyPlannerProfile; plan?: StudyPlan; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Could not save your plan.");
      onSave(data.profile, data.plan ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy/55 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="planner-setup-title">
      <form onSubmit={submit} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]">
        <div className="flex items-start justify-between gap-4 border-b border-navy/10 p-5 sm:p-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">{profile ? "Plan settings" : "Build your baseline"}</p>
            <h2 id="planner-setup-title" className="mt-1 font-display text-2xl font-extrabold text-ink">Make the plan fit real life.</h2>
          </div>
          {profile ? <button type="button" onClick={onClose} aria-label="Close planner settings" className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-xl text-navy/45 hover:bg-haze">×</button> : null}
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-7">
          <label className="block text-sm font-bold text-ink">When is your next SAT?<input required type="date" min={todayInNewYork()} value={testDate} onChange={(event) => setTestDate(event.target.value)} className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
          <label className="block text-sm font-bold text-ink">What score are you aiming for?<input required inputMode="numeric" min="400" max="1600" step="10" type="number" value={goalScore} onChange={(event) => setGoalScore(event.target.value)} className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>

          <div className="sm:col-span-2">
            <label className="block text-sm font-bold text-ink">What&apos;s your current SAT score? <span className="font-medium text-navy/45">Optional</span><input disabled={noScoreYet} inputMode="numeric" min="400" max="1600" step="10" type="number" value={currentScore} onChange={(event) => setCurrentScore(event.target.value)} placeholder="For example, 1240" className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-navy/70"><input checked={noScoreYet} type="checkbox" onChange={(event) => setNoScoreYet(event.target.checked)} className="h-4 w-4 rounded border-navy/25 accent-brand" />I need a baseline first</label>
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-bold text-ink">How much time can you protect on a study day?</legend>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {durationOptions.map((minutes) => <button key={minutes} type="button" onClick={() => setDailyMinutes(minutes)} aria-pressed={dailyMinutes === minutes} className={`min-h-12 cursor-pointer rounded-xl border text-sm font-extrabold transition-colors ${dailyMinutes === minutes ? "border-brand bg-brand text-white" : "border-navy/12 bg-fill text-navy/55 hover:border-brand/35"}`}>{minutes}<span className="ml-1 text-[10px] font-bold opacity-70">min</span></button>)}
            </div>
          </fieldset>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-bold text-ink">Which days can you study?</legend>
            <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => toggleDay(day)} aria-pressed={studyDays.includes(day)} className={`min-h-12 cursor-pointer rounded-xl text-xs font-bold transition-colors ${studyDays.includes(day) ? "bg-brand text-white" : "bg-fill text-navy/55 hover:bg-ice"}`}>{label}</button>)}</div>
          </fieldset>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-bold text-ink">Preferred full-test day</legend>
            <p className="mt-1 text-xs leading-5 text-navy/45">This can be outside your normal study days. We only schedule a full test when your preparation phase calls for one.</p>
            <div className="mt-3 flex flex-wrap gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => setPracticeTestDay(day)} aria-pressed={practiceTestDay === day} className={`min-h-11 cursor-pointer rounded-full px-4 text-sm font-bold transition-colors ${practiceTestDay === day ? "bg-navy text-white" : "border border-navy/15 text-navy/60 hover:border-brand"}`}>{label}</button>)}</div>
          </fieldset>

          {error ? <p role="alert" className="sm:col-span-2 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-navy/10 p-5 sm:px-7">
          {profile ? <button type="button" onClick={onClose} className="min-h-11 cursor-pointer px-4 text-sm font-bold text-navy/55">Cancel</button> : null}
          <button disabled={busy} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60">{busy ? "Building your week…" : profile ? "Save and rebuild" : "Create my plan"}</button>
        </div>
      </form>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  return <div aria-label={`${value}% of this plan complete`} role="img" className="grid h-14 w-14 place-items-center rounded-full" style={{ background: `conic-gradient(#7ccbff ${value * 3.6}deg, rgba(255,255,255,0.12) 0deg)` }}><span className="grid h-10 w-10 place-items-center rounded-full bg-[#174778] text-[10px] font-extrabold text-white">{value}%</span></div>;
}

function TaskIcon({ kind }: { kind: StudyPlanTask["kind"] }) {
  if (kind === "full_test") return <TestsIcon className="h-5 w-5" />;
  if (kind === "review") return <HistoryIcon className="h-5 w-5" />;
  if (kind === "course_lesson") return <BookIcon className="h-5 w-5" />;
  return <TargetIcon className="h-5 w-5" />;
}

function taskLabel(kind: StudyPlanTask["kind"]): string {
  if (kind === "full_test") return "Full-length test";
  if (kind === "review") return "Accuracy rebuild";
  if (kind === "course_lesson") return "Scott lesson";
  return "Targeted practice";
}

function phaseCopy(phase: StudyPlan["phase"]): { label: string; headline: string; description: string } {
  if (phase === "baseline") return { label: "Baseline phase", headline: "Measure first. Then attack the right gaps.", description: "Your first week establishes a real score and enough skill evidence to make every later assignment sharper." };
  if (phase === "foundation") return { label: "Foundation phase", headline: "Build the method before adding pressure.", description: "This week pairs Scott's instruction with focused reps so weak concepts become repeatable habits." };
  if (phase === "build") return { label: "Score-building phase", headline: "Turn weak skills into reliable points.", description: "Most of your time goes to the skills with the clearest accuracy gap, with lessons added exactly where they help." };
  if (phase === "test_ready") return { label: "Test-ready phase", headline: "Convert skill gains into full-test performance.", description: "Timed work and test review now matter more. The plan keeps remediation tight and measures whether it transfers." };
  return { label: "Taper phase", headline: "Protect confidence. Sharpen, do not cram.", description: "The final days stay light and precise: short targeted sets, clean review, and no exhausting full test near test day." };
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = parseDate(start);
  const last = parseDate(end);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function formatDate(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWeekday(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function formatMonthDay(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMinutes(value: number): string {
  if (value < 60) return `${value} planned minutes`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ""} planned`;
}

function todayInNewYork(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function CheckIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CalendarIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h2M14 14h2" strokeLinecap="round" /></svg>; }
function BookIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" strokeLinejoin="round" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10.5h6" strokeLinecap="round" /></svg>; }
function TargetIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m15 9 5-5M16 4h4v4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
