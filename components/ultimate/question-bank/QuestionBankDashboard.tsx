"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";
import type {
  QuestionBankActivity,
  QuestionBankDashboard,
  QuestionBankDifficultyMetric,
  QuestionBankSection,
  QuestionBankSubject,
  QuestionBankTopic,
} from "@/lib/question-bank/dashboard";

const SECTION_COPY: Record<QuestionBankSection, { title: string; shortTitle: string }> = {
  rw: {
    title: "Reading & Writing",
    shortTitle: "R&W",
  },
  math: {
    title: "Math",
    shortTitle: "Math",
  },
};

const DOMAINS: Record<QuestionBankSection, string[]> = {
  rw: [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
  ],
  math: [
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
  ],
};

const SAMPLE_DASHBOARD: QuestionBankDashboard = {
  summary: { attempted: 428, correct: 327, accuracy: 76, saved: 21, streak: 8 },
  subjects: [
    { section: "rw", available: 478, solved: 183, attempts: 207, correct: 166, accuracy: 80 },
    { section: "math", available: 796, solved: 196, attempts: 221, correct: 161, accuracy: 73 },
  ],
  activity: [14, 20, 16, 28, 25, 39, 35, 46, 42, 55, 50, 58].map((total, index) => {
    const correct = Math.round(total * (0.62 + index * 0.021));
    return {
      weekStart: ["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"][index],
      correct,
      wrong: total - correct,
      easyCorrect: 0,
      mediumCorrect: 0,
      hardCorrect: 0,
      easyWrong: 0,
      mediumWrong: 0,
      hardWrong: 0,
    };
  }),
  topics: [
    { section: "rw", domain: "Information and Ideas", available: 110, attempts: 57, correct: 46, accuracy: 81 },
    { section: "rw", domain: "Craft and Structure", available: 120, attempts: 49, correct: 34, accuracy: 69 },
    { section: "rw", domain: "Expression of Ideas", available: 116, attempts: 46, correct: 39, accuracy: 85 },
    { section: "rw", domain: "Standard English Conventions", available: 132, attempts: 55, correct: 47, accuracy: 85 },
    { section: "math", domain: "Algebra", available: 220, attempts: 72, correct: 58, accuracy: 81 },
    { section: "math", domain: "Advanced Math", available: 214, attempts: 61, correct: 39, accuracy: 64 },
    { section: "math", domain: "Problem-Solving and Data Analysis", available: 190, attempts: 53, correct: 40, accuracy: 75 },
    { section: "math", domain: "Geometry and Trigonometry", available: 172, attempts: 35, correct: 23, accuracy: 66 },
  ],
  difficulty: [
    { section: "rw", difficulty: "easy", available: 150, attempts: 74, correct: 66, accuracy: 89, averageDurationMs: 39_000 },
    { section: "rw", difficulty: "medium", available: 190, attempts: 88, correct: 69, accuracy: 78, averageDurationMs: 64_000 },
    { section: "rw", difficulty: "hard", available: 138, attempts: 45, correct: 31, accuracy: 69, averageDurationMs: 91_000 },
    { section: "math", difficulty: "easy", available: 260, attempts: 82, correct: 71, accuracy: 87, averageDurationMs: 48_000 },
    { section: "math", difficulty: "medium", available: 310, attempts: 91, correct: 65, accuracy: 71, averageDurationMs: 79_000 },
    { section: "math", difficulty: "hard", available: 226, attempts: 48, correct: 24, accuracy: 50, averageDurationMs: 112_000 },
  ],
};

type QuestionBankAccess = { plan: PlanCode; test: boolean; used: number; limit: number | "unlimited"; challengeQuestions: boolean; isAdmin: boolean };

export function QuestionBankDashboardView({ dashboard, access }: { dashboard: QuestionBankDashboard; access: QuestionBankAccess }) {
  const [showSampleData, setShowSampleData] = useState(false);
  const [focusView, setFocusView] = useState<"domains" | "difficulty">("domains");
  const sampleDataEnabled = access.isAdmin && showSampleData;
  const visibleDashboard = sampleDataEnabled ? SAMPLE_DASHBOARD : dashboard;
  const totalActivity = visibleDashboard.activity.reduce(
    (total, week) => ({ correct: total.correct + week.correct, wrong: total.wrong + week.wrong }),
    { correct: 0, wrong: 0 },
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-7 sm:py-9">
        <header className="mb-6">
          <div className="flex items-start gap-3">
            <span className="mt-1 grid h-11 w-11 flex-none place-items-center rounded-[14px] border border-navy/10 bg-white text-brand-600">
              <QuestionBankIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="mt-0.5 font-display text-[30px] font-extrabold tracking-[-0.035em] text-ink sm:text-[38px]">
                Question Bank
              </h1>
            </div>
          </div>
        </header>

        {!access.challengeQuestions ? (
          <UpgradePrompt
            currentPlan={access.plan}
            requiredPlan="max"
            title="The full Challenge library unlocks with Max"
            description="Your Free bank already includes a sample of Challenge questions. Max adds Scott's complete set of hardest transfer questions."
            features={["Full Challenge-level access", "Unlimited questions", "Unlimited daily drills"]}
            className="mb-6 !shadow-none"
          />
        ) : null}

        <section aria-labelledby="subject-heading">
          <h2 id="subject-heading" className="sr-only">Question Bank subjects</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {visibleDashboard.subjects.map((subject) => (
              <SubjectCard key={subject.section} subject={subject} challengeLocked={!access.challengeQuestions} />
            ))}
          </div>
        </section>

        <section id="analytics" aria-labelledby="analytics-heading" className="mt-9 scroll-mt-20">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="analytics-heading" className="font-display text-[25px] font-extrabold tracking-[-0.025em] text-ink sm:text-[30px]">
              Question analytics
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy/45">
                Last 12 weeks
              </span>
              {access.isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowSampleData((current) => !current)}
                  aria-pressed={sampleDataEnabled}
                  className="inline-flex min-h-9 items-center rounded-xl border border-brand/25 bg-white px-3 text-xs font-bold text-brand-700 transition-colors hover:border-brand/45 hover:bg-haze"
                >
                  {sampleDataEnabled ? "Show my data" : "Show sample data"}
                </button>
              ) : null}
            </div>
          </div>

          {sampleDataEnabled ? (
            <p className="mb-3 text-xs font-medium text-navy/45">Preview only—your real progress has not changed.</p>
          ) : null}

          <SummaryStrip dashboard={visibleDashboard} />

          <div className="mt-5 min-w-0 rounded-[18px] border border-navy/10 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-extrabold text-ink">Weekly practice</h3>
                <p className="mt-1 text-sm leading-5 text-navy/45">Answer volume and accuracy over time.</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <LegendMetric tone="success" value={totalActivity.correct} label="Correct" />
                <LegendMetric tone="danger" value={totalActivity.wrong} label="Incorrect" />
              </div>
            </div>
            <ActivityChart activity={visibleDashboard.activity} />
          </div>
        </section>

        <section aria-labelledby="detail-heading" className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="detail-heading" className="font-display text-[25px] font-extrabold tracking-[-0.025em] text-ink sm:text-[30px]">
              Focus areas
            </h2>
            <div className="inline-flex rounded-xl border border-navy/10 bg-white p-1" aria-label="Focus area view">
              {(["domains", "difficulty"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setFocusView(view)}
                  aria-pressed={focusView === view}
                  className={`min-h-8 rounded-lg px-3 text-xs font-bold transition-colors ${
                    focusView === view ? "bg-navy text-white" : "text-navy/50 hover:bg-navy/[0.05] hover:text-navy"
                  }`}
                >
                  {view === "domains" ? "Domains" : "Difficulty"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {visibleDashboard.subjects.map((subject) => (
              <SubjectFocusCard
                key={subject.section}
                subject={subject}
                topics={visibleDashboard.topics.filter((topic) => topic.section === subject.section)}
                difficulty={visibleDashboard.difficulty.filter((metric) => metric.section === subject.section)}
                view={focusView}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

function SubjectCard({ subject, challengeLocked }: { subject: QuestionBankSubject; challengeLocked: boolean }) {
  const copy = SECTION_COPY[subject.section];
  const progress = subject.available > 0 ? Math.round((subject.solved / subject.available) * 100) : 0;
  const isMath = subject.section === "math";

  return (
    <article
      className={`relative min-h-[200px] overflow-hidden rounded-[20px] bg-gradient-to-r p-5 text-static-white sm:p-6 ${
        isMath ? "from-[#32bea9] to-[#6bd4c1]" : "from-[#ef7f74] to-[#f7a08d]"
      }`}
    >
      <div className="relative z-10 max-w-[62%]">
        <h3 className="font-display text-2xl font-extrabold tracking-[-0.025em]">{copy.title}</h3>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs font-semibold text-white/80">
          <span>{challengeLocked ? `${subject.solved.toLocaleString()} questions solved` : `${subject.solved.toLocaleString()} of ${subject.available.toLocaleString()} solved`}</span>
          <span>{challengeLocked ? "Full Challenge: Max" : `${progress}%`}</span>
        </div>
        {!challengeLocked ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20" aria-label={`${progress}% solved`}><div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${progress}%` }} /></div> : null}
        <Link href={isMath ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-navy transition-transform hover:-translate-y-0.5">
          Open {copy.shortTitle} <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
      <Image
        src={isMath ? "/images/blu-practice.png" : "/images/blu-learn.png"}
        alt=""
        width={1254}
        height={1254}
        sizes="(min-width: 768px) 280px, 45vw"
        className="pointer-events-none absolute bottom-3 -right-3 h-[92%] w-[48%] object-contain object-bottom"
      />
    </article>
  );
}

function SummaryStrip({ dashboard }: { dashboard: QuestionBankDashboard }) {
  const items = [
    { label: "Questions attempted", value: dashboard.summary.attempted.toLocaleString() },
    { label: "Current accuracy", value: dashboard.summary.attempted > 0 ? `${dashboard.summary.accuracy}%` : "-" },
    { label: "Saved questions", value: dashboard.summary.saved.toLocaleString() },
    { label: "Study streak", value: `${dashboard.summary.streak} ${dashboard.summary.streak === 1 ? "day" : "days"}` },
  ];

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[18px] border border-navy/10 bg-white xl:grid-cols-4">
      {items.map(({ label, value }, index) => (
        <div key={label} className={`min-h-[108px] border-navy/10 p-5 ${summaryCellBorder(index)}`}>
          <p className="text-xs font-semibold text-navy/45">{label}</p>
          <strong className="mt-2 block font-display text-[28px] font-extrabold tracking-[-0.035em] text-ink">{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ActivityChart({ activity }: { activity: QuestionBankActivity[] }) {
  const maxTotal = Math.max(1, ...activity.map((week) => week.correct + week.wrong));
  const hasActivity = activity.some((week) => week.correct + week.wrong > 0);

  return (
    <div className="relative mt-6 overflow-x-auto pb-1" role="img" aria-label="Correct and incorrect Question Bank answers by week">
      <div className="relative h-[224px] min-w-[620px]">
        {[0, 1, 2, 3].map((line) => (
          <div key={line} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-navy/[0.08]" style={{ bottom: `${34 + line * 48}px` }} />
        ))}

        <ol className="absolute inset-x-0 bottom-0 top-0 grid grid-cols-12 items-end gap-2 px-1">
          {activity.map((week, index) => {
            const total = week.correct + week.wrong;
            const barHeight = total > 0 ? Math.max(5, Math.round((total / maxTotal) * 158)) : 0;
            const showLabel = index === 0 || index === activity.length - 1 || index % 3 === 0;
            return (
              <li key={week.weekStart} className="flex h-full min-w-0 flex-col items-center justify-end">
                <span className="sr-only">{formatWeek(week.weekStart)}: {week.correct} correct, {week.wrong} wrong</span>
                <div className="flex h-[158px] w-full max-w-[32px] flex-col justify-end overflow-hidden rounded-t-[6px] bg-navy/[0.035]">
                  <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[6px]" style={{ height: `${barHeight}px` }}>
                    <span className="bg-success" style={{ height: total > 0 ? `${(week.correct / total) * 100}%` : "0%" }} />
                    <span className="bg-danger/65" style={{ height: total > 0 ? `${(week.wrong / total) * 100}%` : "0%" }} />
                  </div>
                </div>
                <span className="mt-3 h-5 whitespace-nowrap text-[10px] font-medium text-navy/40">
                  {showLabel ? formatWeek(week.weekStart) : ""}
                </span>
              </li>
            );
          })}
        </ol>

        {!hasActivity && (
          <div className="pointer-events-none absolute inset-x-0 top-[72px] z-10 mx-auto max-w-sm rounded-2xl border border-navy/10 bg-white/95 px-5 py-4 text-center">
            <strong className="font-display text-base text-navy">No bank attempts yet</strong>
            <p className="mt-1 text-xs leading-5 text-navy/45">Your weekly trend will appear after you answer Question Bank problems.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectFocusCard({
  subject,
  topics,
  difficulty,
  view,
}: {
  subject: QuestionBankSubject;
  topics: QuestionBankTopic[];
  difficulty: QuestionBankDifficultyMetric[];
  view: "domains" | "difficulty";
}) {
  const copy = SECTION_COPY[subject.section];
  const rows = DOMAINS[subject.section].map((domain) =>
    topics.find((topic) => normalizeLabel(topic.domain) === normalizeLabel(domain)) ?? {
      section: subject.section,
      domain,
      available: 0,
      attempts: 0,
      correct: 0,
      accuracy: 0,
    },
  );

  return (
    <article className="overflow-hidden rounded-[18px] border border-navy/10 bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-navy/10 px-5 py-4 sm:px-6">
        <h3 className="font-display text-xl font-extrabold text-ink">{copy.title}</h3>
        <strong className={`font-display text-xl font-extrabold ${subject.attempts > 0 ? accuracyColor(subject.accuracy) : "text-navy/30"}`}>
          {subject.attempts > 0 ? `${subject.accuracy}%` : "-"}
        </strong>
      </header>

      {view === "domains" ? (
        <div className="divide-y divide-navy/[0.07] px-5 sm:px-6">
          {rows.map((topic) => (
            <div key={topic.domain} className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-5 py-4">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-navy">{topic.domain}</h4>
                <p className="mt-0.5 text-[10px] text-navy/35">{topic.attempts.toLocaleString()} attempts</p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-medium text-navy/30">Accuracy</span>
                  <strong className={`text-xs ${topic.attempts > 0 ? accuracyColor(topic.accuracy) : "text-navy/30"}`}>
                    {topic.attempts > 0 ? `${topic.accuracy}%` : "-"}
                  </strong>
                </div>
                <Meter value={topic.attempts > 0 ? topic.accuracy : 0} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-navy/[0.07] px-5 sm:px-6">
          {(["easy", "medium", "hard", "challenge"] as const).map((level) => {
            const metric = difficulty.find((item) => item.difficulty === level);
            const attempts = metric?.attempts ?? 0;
            const accuracy = metric?.accuracy ?? 0;
            // Challenge is gated by plan, so an empty row would read as a
            // missing result rather than a tier this student cannot reach.
            if (level === "challenge" && attempts === 0) return null;
            return (
              <div key={level} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-5 py-5">
                <div className="min-w-0">
                  <h4 className="capitalize text-sm font-semibold text-navy">{level}</h4>
                  <p className="mt-0.5 text-[10px] text-navy/35">{attempts.toLocaleString()} attempts</p>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <strong className={`text-xs ${attempts > 0 ? accuracyColor(accuracy) : "text-navy/30"}`}>
                      {attempts > 0 ? `${accuracy}%` : "-"}
                    </strong>
                    <span className="text-[10px] font-medium tabular-nums text-navy/40">
                      {attempts > 0 ? formatAverageTime(metric?.averageDurationMs ?? 0) : "—"}
                    </span>
                  </div>
                  <Meter value={attempts > 0 ? accuracy : 0} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="border-t border-navy/10 px-5 py-4 sm:px-6">
        <Link
          href={subject.section === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing"}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-navy px-4 text-xs font-bold text-white transition-colors hover:bg-brand-600"
        >
          Practice {copy.shortTitle} <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </article>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-navy/[0.07]" aria-label={`${value}% accuracy`}>
      <div className={`h-full rounded-full ${meterColor(value)}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function LegendMetric({ tone, value, label }: { tone: "success" | "danger"; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${tone === "success" ? "bg-success" : "bg-danger"}`} />
      <strong className="text-lg font-extrabold text-ink">{value.toLocaleString()}</strong>
      <span className="text-xs text-navy/45">{label}</span>
    </span>
  );
}

function formatWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatAverageTime(milliseconds: number): string {
  if (milliseconds <= 0) return "—";
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder.toString().padStart(2, "0")}s avg` : `${seconds}s avg`;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function meterColor(accuracy: number): string {
  if (accuracy > 80) return "bg-success";
  if (accuracy >= 60) return "bg-gold";
  return accuracy > 0 ? "bg-danger" : "bg-navy/10";
}

function accuracyColor(accuracy: number): string {
  if (accuracy > 80) return "text-success-600";
  if (accuracy >= 60) return "text-flag";
  return "text-danger-600";
}

function summaryCellBorder(index: number): string {
  if (index === 0) return "";
  if (index === 1) return "border-l";
  if (index === 2) return "border-t xl:border-l xl:border-t-0";
  return "border-l border-t xl:border-t-0";
}

type IconProps = { className?: string };

function QuestionBankIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="14" rx="2.5" />
      <path d="M8 20h8M12 18v2M8.5 9.2h7M8.5 12.8h4.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 10h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
