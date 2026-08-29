"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "@/components/shell/icons";
import type { StudyPlan, StudyPlanTask } from "@/lib/study-planner/plan";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";
import { upcomingSatDates } from "@/lib/study-planner/sat-dates";

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
  const [setupOpen, setSetupOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [retuning, setRetuning] = useState(false);
  const [retuneError, setRetuneError] = useState<string | null>(null);

  const today = todayInNewYork();
  const profileExpired = profile !== null && profile.testDate < today;

  async function retunePlan() {
    setOptionsOpen(false);
    setRetuning(true);
    setRetuneError(null);
    try {
      const response = await fetch("/api/study-planner/plan", { method: "POST" });
      const body = (await response.json()) as { plan?: StudyPlan; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error ?? "Could not refresh your plan.");
      setPlan(body.plan);
      router.refresh();
    } catch (reason) {
      setRetuneError(reason instanceof Error ? reason.message : "Could not refresh your plan.");
    } finally {
      setRetuning(false);
    }
  }

  return (
    <div>
      {profile ? (
        <PlannerHeader
          hasProfile
          optionsOpen={optionsOpen}
          retuning={retuning}
          onEdit={() => {
            setOptionsOpen(false);
            setSetupOpen(true);
          }}
          onOptionsChange={setOptionsOpen}
          onRetune={() => void retunePlan()}
        />
      ) : null}

      {retuneError ? (
        <p role="alert" className="mb-5 rounded-xl border border-danger/15 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-600">
          {retuneError}
        </p>
      ) : null}

      {profileExpired && profile ? (
        <ExpiredPlan profile={profile} onEdit={() => setSetupOpen(true)} />
      ) : plan && profile ? (
        <ActivePlan plan={plan} profile={profile} />
      ) : profile ? (
        <PlanUnavailable retuning={retuning} onRetune={() => void retunePlan()} />
      ) : (
        <PlannerBlankState onStart={() => setSetupOpen(true)} />
      )}

      {setupOpen ? (
        <PlannerSetup
          profile={profile}
          onClose={() => setSetupOpen(false)}
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

function PlannerHeader({
  hasProfile,
  optionsOpen,
  retuning,
  onEdit,
  onOptionsChange,
  onRetune,
}: {
  hasProfile: boolean;
  optionsOpen: boolean;
  retuning: boolean;
  onEdit: () => void;
  onOptionsChange: (open: boolean) => void;
  onRetune: () => void;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand text-white">
          <CalendarIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-ink sm:text-[32px]">My Study Plan</h1>
        </div>
      </div>

      {hasProfile ? (
        <div className="relative flex-none">
          <button
            type="button"
            aria-expanded={optionsOpen}
            aria-haspopup="menu"
            onClick={() => onOptionsChange(!optionsOpen)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-navy/30"
          >
            Options
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
          </button>
          {optionsOpen ? (
            <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 overflow-hidden rounded-xl border border-navy/10 bg-white p-1.5 shadow-xl">
              <button type="button" role="menuitem" onClick={onEdit} className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-navy hover:bg-haze">
                <EditIcon className="h-4 w-4 text-navy/50" />
                Edit plan
              </button>
              <button type="button" role="menuitem" disabled={retuning} onClick={onRetune} className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-navy hover:bg-haze disabled:cursor-wait disabled:opacity-50">
                <RefreshIcon className={`h-4 w-4 text-navy/50 ${retuning ? "animate-spin" : ""}`} />
                {retuning ? "Refreshing plan…" : "Refresh from progress"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function ActivePlan({
  plan,
  profile,
}: {
  plan: StudyPlan;
  profile: StudyPlannerProfile;
}) {
  return (
    <div className="space-y-7">
      <PlanSummary plan={plan} profile={profile} />

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-navy/45">This week</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">{formatDateRange(plan.startsOn, plan.endsOn)}</h2>
          </div>
          <p className="text-sm font-medium text-navy/45">{plan.progress.completed} of {plan.progress.target} tasks complete</p>
        </div>
        <PlanSchedule plan={plan} />
      </section>

      {plan.focusAreas.length > 0 ? (
        <section className="rounded-2xl border border-navy/10 bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-extrabold text-ink">Focus this week</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.focusAreas.slice(0, 3).map((focus) => (
              <div key={`${focus.section}-${focus.skill}`} className="rounded-xl border border-navy/10 px-4 py-3.5">
                <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-bold ${subjectTone(focus.section)}`}>
                  {focus.section === "math" ? "Math" : "R&W"}
                </span>
                <p className="mt-1 text-sm font-bold leading-5 text-ink">{focus.skill}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </div>
  );
}

function PlanSummary({ plan, profile }: { plan: StudyPlan; profile: StudyPlannerProfile }) {
  return (
    <section className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]" aria-label="Plan overview">
      <div className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-extrabold text-ink">Weekly progress</h2>
        <p className="mt-4 font-display text-3xl font-extrabold tracking-[-0.035em] text-ink">{plan.progress.percent}% complete</p>
        <p className="mt-1 text-sm font-semibold text-navy/45">{plan.progress.completed} of {plan.progress.target} tasks</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dfeef9]" role="progressbar" aria-label="Weekly plan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.progress.percent}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${plan.progress.percent}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-navy/10 pt-3 text-xs">
          <span className="font-semibold text-navy/40">Planned study time</span>
          <span className="font-bold text-navy/55">{formatMinutes(plan.totalMinutes)}</span>
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-extrabold text-ink">SAT test date</h2>
        <p className="mt-4 font-display text-3xl font-extrabold tracking-[-0.035em] text-ink">
          {plan.daysToTest === 0 ? "Test day is today" : `${plan.daysToTest} ${plan.daysToTest === 1 ? "day" : "days"} left`}
        </p>
        <p className="mt-1 text-sm font-semibold text-navy/45">{formatReviewDate(profile.testDate)}</p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-navy/10 pt-3 text-xs">
          <span className="font-semibold text-navy/40">Score target</span>
          <span className="inline-flex items-center gap-1.5 font-bold">
            <span className="text-navy/50">{plan.currentScore?.toLocaleString() ?? "Baseline"}</span>
            <ChevronRightIcon className="h-3.5 w-3.5 text-navy/20" />
            <span className="text-brand-600">{plan.goalScore.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function PlanSchedule({ plan }: { plan: StudyPlan }) {
  const days = useMemo(() => dateRange(plan.startsOn, plan.endsOn).map((date) => ({
    date,
    tasks: plan.tasks.filter((task) => task.date === date).sort((a, b) => a.position - b.position),
  })).filter(({ date, tasks }) => tasks.length > 0 || date === plan.testDate), [plan]);
  const primaryTaskId = days.flatMap(({ tasks }) => tasks).find((task) => !task.completed)?.id ?? null;

  if (days.length === 0) {
    return <div className="rounded-2xl border-2 border-navy/10 bg-white px-6 py-12 text-center"><p className="text-sm font-semibold text-navy/50">No tasks are scheduled for this week.</p></div>;
  }

  return (
    <ol className="divide-y-2 divide-haze overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
      {days.map(({ date, tasks }) => <WeekDayRow key={date} date={date} tasks={tasks} isExamDate={date === plan.testDate} primaryTaskId={primaryTaskId} />)}
    </ol>
  );
}

function WeekDayRow({ date, tasks, isExamDate, primaryTaskId }: { date: string; tasks: StudyPlanTask[]; isExamDate: boolean; primaryTaskId: string | null }) {
  const daySection = tasks.find((task) => task.section)?.section ?? null;

  return (
    <li className="flex gap-5 px-5 py-4 sm:gap-8 sm:px-6">
      <div className="w-14 flex-none pt-1 text-navy/45 sm:w-16">
        <p className="text-xs font-semibold">{formatWeekday(date)}</p>
        <p className={`mt-1 font-display text-3xl font-extrabold leading-none tracking-[-0.05em] ${isExamDate ? "text-danger-600" : "text-ink"}`}>{formatDay(date)}</p>
        <p className="mt-1 text-sm font-semibold">{formatMonth(date)}</p>
      </div>
      <div className="min-w-0 flex-1 divide-y-2 divide-haze">
        {tasks.map((task) => <PlanTaskRow key={task.id} task={task} section={task.section ?? daySection} primary={task.id === primaryTaskId} />)}
        {isExamDate ? <ExamDateRow /> : null}
      </div>
    </li>
  );
}

function PlanTaskRow({ task, section, primary }: { task: StudyPlanTask; section: StudyPlanTask["section"]; primary: boolean }) {
  const progressText = task.kind === "course_lesson"
    ? task.completed ? "Lesson completed" : "Assigned lesson"
    : task.kind === "full_test"
      ? task.completed ? "Practice test completed" : "Full practice test"
      : `${task.progress.completed}/${task.progress.target} questions complete`;

  return (
    <article className="flex min-w-0 items-center gap-3 py-3.5 first:pt-1 last:pb-1 sm:gap-4">
      <span aria-label={task.completed ? "Complete" : "Not complete"} role="img" className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 ${task.completed ? "border-success bg-success text-white" : "border-navy/20 bg-white"}`}>
        {task.completed ? <CheckIcon className="h-4 w-4" /> : task.progress.completed > 0 ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={`text-sm font-bold leading-5 text-ink sm:text-base ${task.completed ? "line-through opacity-55" : ""}`}>{task.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-navy/45">
          {section ? <span className={`inline-flex rounded-md px-1.5 py-1 text-[10px] font-bold leading-none ${subjectTone(section)}`}>{section === "math" ? "Math" : "R&W"}</span> : null}
          <strong className="font-semibold">{taskLabel(task.kind)}</strong>
          <span aria-hidden="true">/</span>
          <span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{task.estimatedMinutes} min</span>
          <span aria-hidden="true">/</span>
          <span>{progressText}</span>
        </p>
      </div>
      {!task.completed ? (
        <Link href={task.href} className={`inline-flex min-h-10 flex-none items-center gap-1 rounded-xl border px-3.5 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${primary ? "border-navy bg-navy text-white hover:border-brand-600 hover:bg-brand-600" : "border-navy/15 bg-white text-navy hover:border-brand/40 hover:text-brand-600"}`}>
          {task.progress.completed > 0 ? "Continue" : "Start"}<ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </article>
  );
}

function ExamDateRow() {
  return (
    <div className="flex items-center gap-4 py-3.5 first:pt-1 last:pb-1">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-danger-bg text-danger-600"><CalendarIcon className="h-4 w-4" /></span>
      <div><p className="text-sm font-bold text-ink">SAT test day</p><p className="mt-0.5 text-xs text-navy/45">Trust the work you have already done.</p></div>
    </div>
  );
}

function ExpiredPlan({ profile, onEdit }: { profile: StudyPlannerProfile; onEdit: () => void }) {
  return (
    <section className="rounded-2xl border-2 border-navy/10 bg-white px-6 py-10 text-center sm:px-10 sm:py-14">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ice text-brand-600"><CalendarIcon className="h-7 w-7" /></span>
      <h2 className="mt-5 font-display text-2xl font-extrabold text-ink">Choose your next SAT date</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-navy/50">Your {formatLongDate(profile.testDate)} test date has passed. Pick a new date and we will rebuild the week while keeping your completed work in your learning history.</p>
      <button type="button" onClick={onEdit} className="mt-6 min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-600">Update test date</button>
    </section>
  );
}

function PlanUnavailable({ retuning, onRetune }: { retuning: boolean; onRetune: () => void }) {
  return (
    <section className="rounded-2xl border-2 border-navy/10 bg-white px-6 py-10 text-center sm:py-14">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ice text-brand-600"><RefreshIcon className="h-6 w-6" /></span>
      <h2 className="mt-5 font-display text-2xl font-extrabold text-ink">Your week is ready for a fresh build</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-navy/50">Use your latest lessons, question accuracy, and test history to create the next set of tasks.</p>
      <button type="button" disabled={retuning} onClick={onRetune} className="mt-6 min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{retuning ? "Building your week…" : "Build my week"}</button>
    </section>
  );
}

function PlannerBlankState({ onStart }: { onStart: () => void }) {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center pb-8 pt-3 sm:pt-8">
      <PlannerHeroPreview />
      <h1 className="mt-7 text-center font-display text-[32px] font-extrabold tracking-[-0.04em] text-ink sm:text-[40px]">
        Create a game plan for your SAT
      </h1>

      <button
        type="button"
        onClick={onStart}
        className="group relative mt-9 flex w-full max-w-xl cursor-pointer flex-col overflow-hidden rounded-2xl bg-[#e9eef5] p-5 text-left transition-colors hover:bg-[#e1e8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-6"
      >
        <CalendarIcon className="pointer-events-none absolute -bottom-4 -right-4 h-28 w-28 -rotate-12 text-navy opacity-[0.05]" />
        <span className="relative font-display text-xl font-extrabold text-ink">Start from scratch</span>
        <span className="relative mt-2 max-w-md text-sm leading-6 text-navy/55">
          Answer a few quick questions and we’ll build a focused plan from your goals, schedule, and latest progress.
        </span>
        <span className="relative mt-5 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-navy px-4 text-sm font-bold text-white transition-colors group-hover:bg-navy-700">
          Continue
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      </button>

    </section>
  );
}

function PlannerHeroPreview() {
  const columns = [
    ["bg-brand/75", "bg-success/65", "bg-gold/75"],
    ["bg-[#9677e8]/70", "bg-brand/65"],
    ["bg-[#ed7798]/65", "bg-success/60", "bg-gold/70"],
  ];

  return (
    <div aria-hidden="true" className="relative mx-auto h-36 w-full max-w-md">
      <div className="grid grid-cols-3 gap-3 px-5">
        {columns.map((tasks, columnIndex) => (
          <div key={columnIndex} className="rounded-2xl border border-navy/[0.07] bg-white p-3">
            <span className="mb-3 block h-1.5 w-8 rounded-full bg-navy/15" />
            <span className="flex flex-col gap-2">
              {tasks.map((tone, taskIndex) => <span key={`${columnIndex}-${taskIndex}`} className={`h-6 rounded-lg ${tone}`} />)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlannerSetup({ profile, onClose, onSave }: { profile: StudyPlannerProfile | null; onClose: () => void; onSave: (profile: StudyPlannerProfile, plan: StudyPlan | null) => void }) {
  const today = todayInNewYork();
  const satDates = upcomingSatDates(today);
  const savedFutureDate = profile?.testDate && profile.testDate >= today ? profile.testDate : null;
  const [step, setStep] = useState(0);
  const [testDate, setTestDate] = useState(savedFutureDate ?? satDates[0] ?? "");
  const [customDateOpen, setCustomDateOpen] = useState(satDates.length === 0 || Boolean(savedFutureDate && !satDates.includes(savedFutureDate)));
  const [currentScore, setCurrentScore] = useState(profile?.currentScore?.toString() ?? "");
  const [noScoreYet, setNoScoreYet] = useState(profile ? profile.currentScore === null : true);
  const [goalScore, setGoalScore] = useState(profile?.goalScore?.toString() ?? "1500");
  const [studyDays, setStudyDays] = useState<number[]>(profile?.studyDays ?? [1, 2, 3, 4, 5]);
  const [practiceTestDay, setPracticeTestDay] = useState(profile?.practiceTestDay ?? 6);
  const [dailyMinutes, setDailyMinutes] = useState(profile?.dailyMinutes ?? 45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepDirection, setStepDirection] = useState<"forward" | "back">("forward");

  const stepContent = [
    { title: "Set your SAT target", description: "Start with the date and score that this plan is working toward." },
    { title: "Build around your week", description: "Choose a pace you can repeat without burning out." },
    { title: "Review your plan", description: "We will use these settings and your existing progress to build the first week." },
  ];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose]);

  function toggleDay(day: number) {
    setStudyDays((days) => days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort());
  }

  function continueSetup() {
    setError(null);
    if (step === 0 && (!testDate || testDate < today || !isValidSatScore(goalScore) || (!noScoreYet && !isValidSatScore(currentScore)))) {
      setError("Check your test date and use SAT scores from 400 to 1600 in increments of 10.");
      return;
    }
    if (step === 1 && studyDays.length === 0) {
      setError("Choose at least one day when you can study.");
      return;
    }
    setStepDirection("forward");
    setStep((value) => Math.min(2, value + 1));
  }

  function goBack() {
    setError(null);
    setStepDirection("back");
    setStep((value) => Math.max(0, value - 1));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      continueSetup();
      return;
    }

    setError(null);
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
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy/55 backdrop-blur-[2px] sm:place-items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="planner-setup-title">
      <form onSubmit={submit} className="relative flex max-h-[94dvh] min-h-[520px] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-navy/10 bg-white sm:rounded-3xl">
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close study plan setup" className="absolute right-3 top-3 z-10 grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-xl text-navy/45 hover:bg-haze disabled:opacity-50"><CloseIcon className="h-5 w-5" /></button>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-12 sm:px-8">
          <div
            key={step}
            className={`flex flex-col gap-7 md:grid md:grid-cols-[2fr_3fr] md:gap-10 ${
              stepDirection === "forward"
                ? "motion-safe:animate-planner-step-forward"
                : "motion-safe:animate-planner-step-back"
            }`}
          >
            <div className="md:sticky md:top-0 md:self-start">
              <p className="text-sm font-semibold text-navy/45">Step {step + 1} of 3</p>
              <h2 id="planner-setup-title" className="mt-3 max-w-xs font-display text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-3xl">{stepContent[step].title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-6 text-navy/50">{stepContent[step].description}</p>
              <div className="mt-6 flex max-w-[180px] gap-2" aria-hidden="true">{[0, 1, 2].map((index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-brand" : "bg-haze"}`} />)}</div>
            </div>

            <div className="min-w-0">
              {step === 0 ? <ScoreStep
                currentScore={currentScore}
                customDateOpen={customDateOpen}
                goalScore={goalScore}
                noScoreYet={noScoreYet}
                satDates={satDates}
                testDate={testDate}
                today={today}
                onCurrentScoreChange={setCurrentScore}
                onCustomDateOpenChange={setCustomDateOpen}
                onGoalScoreChange={setGoalScore}
                onNoScoreYetChange={setNoScoreYet}
                onTestDateChange={setTestDate}
              /> : null}
              {step === 1 ? <ScheduleStep
                dailyMinutes={dailyMinutes}
                practiceTestDay={practiceTestDay}
                studyDays={studyDays}
                onDailyMinutesChange={setDailyMinutes}
                onPracticeTestDayChange={setPracticeTestDay}
                onToggleDay={toggleDay}
              /> : null}
              {step === 2 ? (
                <PlanReview
                  currentScore={currentScore}
                  dailyMinutes={dailyMinutes}
                  goalScore={goalScore}
                  noScoreYet={noScoreYet}
                  practiceTestDay={practiceTestDay}
                  studyDays={studyDays}
                  testDate={testDate}
                />
              ) : null}
              {error ? <p role="alert" className="mt-5 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-600">{error}</p> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-navy/10 px-5 py-4 sm:px-8">
          <button type="button" disabled={busy} onClick={step === 0 ? onClose : goBack} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-navy/55 disabled:opacity-50">{step === 0 ? "Cancel" : "Back"}</button>
          <button disabled={busy} className="min-h-11 cursor-pointer rounded-xl bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-navy-700 disabled:cursor-wait disabled:opacity-60">{busy ? "Building your week…" : step === 2 ? profile ? "Save and rebuild" : "Create my plan" : "Continue"}</button>
        </div>
      </form>
    </div>
  );
}

function ScoreStep({
  currentScore,
  customDateOpen,
  goalScore,
  noScoreYet,
  satDates,
  testDate,
  today,
  onCurrentScoreChange,
  onCustomDateOpenChange,
  onGoalScoreChange,
  onNoScoreYetChange,
  onTestDateChange,
}: {
  currentScore: string;
  customDateOpen: boolean;
  goalScore: string;
  noScoreYet: boolean;
  satDates: string[];
  testDate: string;
  today: string;
  onCurrentScoreChange: (value: string) => void;
  onCustomDateOpenChange: (open: boolean) => void;
  onGoalScoreChange: (value: string) => void;
  onNoScoreYetChange: (value: boolean) => void;
  onTestDateChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="sat-test-date" className="block text-sm font-bold text-ink">When is your next SAT?</label>
        <select id="sat-test-date" value={customDateOpen ? "custom" : testDate} onChange={(event) => {
          if (event.target.value === "custom") {
            onCustomDateOpenChange(true);
            onTestDateChange("");
          } else {
            onCustomDateOpenChange(false);
            onTestDateChange(event.target.value);
          }
        }} className="mt-2 block min-h-12 w-full cursor-pointer border border-navy/15 bg-fill px-3 text-base font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
          {satDates.map((date, index) => <option key={date} value={date}>{index === 0 ? "Next · " : ""}{formatLongDate(date)}</option>)}
          <option value="custom">Custom or school-day date…</option>
        </select>
        {customDateOpen ? <input required aria-label="Custom SAT date" type="date" min={today} value={testDate} onChange={(event) => onTestDateChange(event.target.value)} className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /> : null}
      </div>
      <label className="block text-sm font-bold text-ink">What score are you aiming for?<input required inputMode="numeric" min="400" max="1600" step="10" type="number" value={goalScore} onChange={(event) => onGoalScoreChange(event.target.value)} className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
      <div>
        <label className="block text-sm font-bold text-ink">What is your current SAT score? <span className="font-medium text-navy/45">Optional</span><input disabled={noScoreYet} inputMode="numeric" min="400" max="1600" step="10" type="number" value={currentScore} onChange={(event) => onCurrentScoreChange(event.target.value)} placeholder="For example, 1240" className="mt-2 block min-h-12 w-full border border-navy/15 bg-fill px-3 text-base font-medium text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-brand focus:ring-2 focus:ring-brand/20" /></label>
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm font-medium text-navy/70">
          <input checked={noScoreYet} type="checkbox" onChange={(event) => onNoScoreYetChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-navy/25 accent-brand" />
          <span>
            <span className="block">I don’t have a current SAT score</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function ScheduleStep({ dailyMinutes, practiceTestDay, studyDays, onDailyMinutesChange, onPracticeTestDayChange, onToggleDay }: { dailyMinutes: number; practiceTestDay: number; studyDays: number[]; onDailyMinutesChange: (minutes: number) => void; onPracticeTestDayChange: (day: number) => void; onToggleDay: (day: number) => void }) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-bold text-ink">How much time can you study each day?</legend>
        <div className="mt-3 grid grid-cols-4 gap-2">{durationOptions.map((minutes) => <button key={minutes} type="button" onClick={() => onDailyMinutesChange(minutes)} aria-pressed={dailyMinutes === minutes} className={`min-h-12 cursor-pointer rounded-xl border text-sm font-bold transition-colors ${dailyMinutes === minutes ? "border-brand bg-brand text-white" : "border-navy/12 bg-fill text-navy/55 hover:border-brand/35"}`}>{minutes}<span className="ml-1 text-[10px] opacity-70">min</span></button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-bold text-ink">Which days can you study?</legend>
        <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => onToggleDay(day)} aria-pressed={studyDays.includes(day)} className={`min-h-12 cursor-pointer rounded-xl border text-xs font-bold transition-colors ${studyDays.includes(day) ? "border-brand bg-brand text-white" : "border-navy/15 bg-fill text-navy/55 hover:border-brand/35 hover:bg-ice"}`}>{label}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-bold text-ink">Preferred full-test day</legend>
        <div className="mt-3 flex flex-wrap gap-2">{dayLabels.map((label, day) => <button key={label} type="button" onClick={() => onPracticeTestDayChange(day)} aria-pressed={practiceTestDay === day} className={`min-h-10 cursor-pointer rounded-full px-4 text-sm font-bold transition-colors ${practiceTestDay === day ? "bg-navy text-white" : "border border-navy/15 text-navy/60 hover:border-brand"}`}>{label}</button>)}</div>
      </fieldset>
    </div>
  );
}

function PlanReview({ currentScore, dailyMinutes, goalScore, noScoreYet, practiceTestDay, studyDays, testDate }: { currentScore: string; dailyMinutes: number; goalScore: string; noScoreYet: boolean; practiceTestDay: number; studyDays: number[]; testDate: string }) {
  return (
    <section aria-label="Plan summary" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ReviewMetric label="SAT date" value={formatReviewDate(testDate)} />
        <ReviewMetric
          label="Score goal"
          value={noScoreYet
            ? Number(goalScore).toLocaleString()
            : `${Number(currentScore).toLocaleString()} → ${Number(goalScore).toLocaleString()}`}
          detail={noScoreYet ? "Baseline test needed" : undefined}
        />
      </div>

      <div className="rounded-2xl border border-navy/10 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-ink">Weekly schedule</h3>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-haze px-4 py-3">
            <span className="block text-[11px] font-semibold text-navy/40">Time per study day</span>
            <strong className="mt-0.5 block text-base text-ink">{dailyMinutes} minutes</strong>
          </div>
          <div className="rounded-xl bg-haze px-4 py-3">
            <span className="block text-[11px] font-semibold text-navy/40">Study frequency</span>
            <strong className="mt-0.5 block text-base text-ink">{studyDays.length} {studyDays.length === 1 ? "day" : "days"} per week</strong>
          </div>
        </div>

        <div className="mt-4">
          <span className="block text-[11px] font-semibold text-navy/40">Study days</span>
          <div className="mt-2 grid grid-cols-7 gap-1.5" aria-label={`Study on ${studyDays.map((day) => dayLabels[day]).join(", ")}`}>
            {dayLabels.map((label, day) => (
              <span
                key={label}
                className={`grid min-h-10 place-items-center rounded-xl border text-xs font-bold ${
                  studyDays.includes(day)
                    ? "border-brand bg-brand text-white"
                    : "border-navy/10 bg-fill text-navy/30"
                }`}
              >
                {label.slice(0, 1)}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-haze px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-navy/50">
            <CalendarIcon className="h-4 w-4" />
            Full practice test
          </span>
          <strong className="text-sm text-ink">{fullDayName(practiceTestDay)}</strong>
        </div>
      </div>
    </section>
  );
}

function ReviewMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-navy/10 p-4">
      <span className="text-xs font-semibold text-navy/45">{label}</span>
      <strong className="mt-1 block font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">{value}</strong>
      {detail ? <span className="mt-1 block text-xs font-medium text-navy/40">{detail}</span> : null}
    </div>
  );
}

function taskLabel(kind: StudyPlanTask["kind"]): string {
  if (kind === "full_test") return "Practice test";
  if (kind === "review") return "Review";
  if (kind === "course_lesson") return "Lesson";
  return "Practice";
}

function subjectTone(section: NonNullable<StudyPlanTask["section"]>): string {
  return section === "math"
    ? "bg-[#cefbff] text-[#168fca]"
    : "bg-[#f9e6ff] text-[#aa2abd]";
}

function isValidSatScore(value: string): boolean {
  const score = Number(value);
  return Number.isInteger(score) && score >= 400 && score <= 1600 && score % 10 === 0;
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

function formatDateRange(start: string, end: string): string {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const first = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const last = endDate.toLocaleDateString("en-US", { month: startDate.getUTCMonth() === endDate.getUTCMonth() ? undefined : "long", day: "numeric", timeZone: "UTC" });
  return `${first} to ${last}`;
}

function formatLongDate(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatWeekday(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function formatReviewDate(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fullDayName(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "";
}

function formatMonth(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function formatDay(value: string): string {
  return parseDate(value).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
}

function formatMinutes(value: number): string {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
}

function todayInNewYork(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function CheckIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CalendarIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h2M14 14h2" strokeLinecap="round" /></svg>; }
function ClockIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ChevronDownIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 9.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function EditIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function RefreshIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 8a7.5 7.5 0 1 0 .2 7.5M19 4v4h-4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>; }
