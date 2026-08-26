import Link from "next/link";
import { FlameIcon } from "@/components/shell/icons";
import { PlanBadge } from "@/components/account/PlanBadge";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";
import type {
  QuestionBankActivity,
  QuestionBankDashboard,
  QuestionBankDifficulty,
  QuestionBankDifficultyMetric,
  QuestionBankSection,
  QuestionBankSubject,
  QuestionBankTopic,
} from "@/lib/question-bank/dashboard";

const SECTION_COPY: Record<QuestionBankSection, { title: string; shortTitle: string; description: string }> = {
  rw: {
    title: "Reading & Writing",
    shortTitle: "R&W",
    description: "Rhetoric, comprehension, transitions, and conventions",
  },
  math: {
    title: "Math",
    shortTitle: "Math",
    description: "Algebra, advanced math, data analysis, and geometry",
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

type QuestionBankAccess = { plan: PlanCode; test: boolean; used: number; limit: number; challengeQuestions: boolean };

export function QuestionBankDashboardView({ dashboard, access }: { dashboard: QuestionBankDashboard; access: QuestionBankAccess }) {
  const totalActivity = dashboard.activity.reduce(
    (total, week) => ({ correct: total.correct + week.correct, wrong: total.wrong + week.wrong }),
    { correct: 0, wrong: 0 },
  );
  const usage = Math.min(access.used, access.limit);
  const usagePercent = access.limit > 0 ? Math.min(100, Math.round((usage / access.limit) * 100)) : 0;

  return (
    <div className="min-h-dvh bg-[#f7f8fa]">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-7 sm:py-9">
        <header className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div className="flex items-start gap-3">
            <QuestionBankIcon className="mt-1 h-6 w-6 flex-none text-brand-600" />
            <div>
              <p className="text-xs font-semibold text-brand-600">Practice</p>
              <h1 className="mt-0.5 font-display text-[32px] font-semibold tracking-[-0.035em] text-ink sm:text-[38px]">
                Question Bank
              </h1>
              <p className="mt-2 max-w-2xl text-[15px] leading-6 text-navy/58">
                Choose an SAT section or skill. Submitted answers update the accuracy and timing reports below.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-navy/12 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <PlanBadge plan={access.plan} test={access.test} />
              <span className="text-[11px] font-medium text-navy/45">Math &amp; R&amp;W</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div><strong className="font-display text-lg font-semibold tabular-nums text-navy">{usage.toLocaleString()}</strong><span className="text-xs font-medium text-navy/45"> / {access.limit.toLocaleString()} used</span></div>
              {access.plan !== "max" ? <Link href="/pricing" className="text-xs font-semibold text-brand-700 transition-colors hover:text-navy">Plan limits →</Link> : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/[0.07]" aria-label={`${usagePercent}% of included questions used`}><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${usagePercent}%` }} /></div>
            <a href="#analytics" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-navy/10 text-xs font-semibold text-navy transition-colors hover:border-brand/30 hover:text-brand-700">View analytics <ChevronDownIcon className="h-4 w-4" /></a>
          </div>
        </header>

        {!access.challengeQuestions ? (
          <UpgradePrompt
            currentPlan={access.plan}
            requiredPlan="core"
            title="Core adds Challenge questions"
            description="Your Free bank stays available. Core adds harder transfer questions, 3,000 submissions, and daily drills."
            features={["Challenge Question access", "3,000 included submissions", "Daily skill drills"]}
            className="mb-6"
          />
        ) : null}

        <section aria-labelledby="subject-heading">
          <h2 id="subject-heading" className="sr-only">Question Bank subjects</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.subjects.map((subject) => (
              <SubjectCard key={subject.section} subject={subject} challengeLocked={!access.challengeQuestions} />
            ))}
          </div>
        </section>

        <section id="analytics" aria-labelledby="analytics-heading" className="mt-9 scroll-mt-20">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-brand-600">Performance</p>
              <h2 id="analytics-heading" className="mt-1 font-display text-[25px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
                Question analytics
              </h2>
            </div>
            <span className="text-xs text-navy/40">Updates after every submitted answer</span>
          </div>

          <SummaryStrip dashboard={dashboard} />

          <div className="mt-5 rounded-xl border border-navy/12 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Activity by week</h3>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-navy/45">
                  Correct and incorrect answers by week across the last twelve weeks. Darker segments are harder questions.
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <LegendMetric tone="success" value={totalActivity.correct} label="Correct" />
                <LegendMetric tone="danger" value={totalActivity.wrong} label="Wrong" />
              </div>
            </div>
            <ActivityChart activity={dashboard.activity} />
          </div>
        </section>

        <section aria-labelledby="detail-heading" className="mt-8">
          <div className="mb-4">
            <p className="text-xs font-semibold text-brand-600">By topic</p>
            <h2 id="detail-heading" className="mt-1 font-display text-[25px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
              Accuracy and timing
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-navy/45">
              Review attempts, accuracy, and average answer time for each domain and difficulty.{!access.challengeQuestions ? " Inventory totals include Challenge questions available on Core." : ""}
            </p>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {dashboard.subjects.map((subject) => (
              <SubjectAnalytics
                key={subject.section}
                subject={subject}
                topics={dashboard.topics.filter((topic) => topic.section === subject.section)}
                difficulty={dashboard.difficulty.filter((metric) => metric.section === subject.section)}
              />
            ))}
          </div>
        </section>

        <aside className="mt-8 flex flex-col gap-4 rounded-xl border border-navy/12 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-semibold text-brand-600">Question inventory</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-navy">Both SAT sections are available</h2>
            <p className="mt-1 text-sm leading-5 text-navy/50">
              Practice 19 Math skills or 10 Reading &amp; Writing skills. Every submitted answer updates these reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/ultimate/bank/reading-writing" className="inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
              Open Reading &amp; Writing <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link href="/ultimate/bank/math" className="inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg border border-navy/15 bg-white px-4 text-sm font-semibold text-navy transition-colors hover:border-brand/35 hover:text-brand-600">
              Open Math <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SubjectCard({ subject, challengeLocked }: { subject: QuestionBankSubject; challengeLocked: boolean }) {
  const copy = SECTION_COPY[subject.section];
  const progress = subject.available > 0 ? Math.round((subject.solved / subject.available) * 100) : 0;
  const isMath = subject.section === "math";

  return (
    <article className={`min-h-[230px] rounded-xl border bg-white p-5 sm:p-6 ${isMath ? "border-brand/25" : "border-navy/12"}`}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <QuestionBankIcon className={`h-5 w-5 ${isMath ? "text-brand-600" : "text-navy/55"}`} />
          <span className="text-[11px] font-medium text-navy/45">{challengeLocked ? "Free bank" : "All levels"}</span>
        </div>
        <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">{copy.title}</h3>
        <p className="mt-1 text-sm leading-5 text-navy/55">{copy.description}</p>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs font-medium text-navy/55">
          <span>{challengeLocked ? `${subject.solved.toLocaleString()} questions solved` : `${subject.solved.toLocaleString()} of ${subject.available.toLocaleString()} solved`}</span>
          <span>{challengeLocked ? "Core adds Challenge" : `${progress}%`}</span>
        </div>
        {!challengeLocked ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy/[0.07]" aria-label={`${progress}% solved`}><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress}%` }} /></div> : null}
        <Link href={isMath ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
          Open {copy.shortTitle} <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function SummaryStrip({ dashboard }: { dashboard: QuestionBankDashboard }) {
  const items = [
    { label: "Questions attempted", value: dashboard.summary.attempted.toLocaleString(), Icon: AttemptIcon },
    { label: "Current accuracy", value: dashboard.summary.attempted > 0 ? `${dashboard.summary.accuracy}%` : "-", Icon: AccuracyIcon },
    { label: "Saved questions", value: dashboard.summary.saved.toLocaleString(), Icon: BookmarkIcon },
    { label: "Study streak", value: `${dashboard.summary.streak} ${dashboard.summary.streak === 1 ? "day" : "days"}`, Icon: FlameIcon },
  ];

  return (
    <div className="grid overflow-hidden rounded-xl border border-navy/12 bg-white sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ label, value, Icon }, index) => (
        <div key={label} className={`min-h-[112px] border-navy/10 p-5 ${summaryCellBorder(index)}`}>
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-navy/48">{label}</p><Icon className="h-4 w-4 text-navy/28" /></div>
          <strong className="mt-3 block font-display text-[28px] font-semibold tabular-nums tracking-[-0.035em] text-ink">{value}</strong>
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
      <div className="relative h-[250px] min-w-[640px]">
        {[0, 1, 2, 3].map((line) => (
          <div key={line} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-navy/10" style={{ bottom: `${36 + line * 58}px` }} />
        ))}

        <ol className="absolute inset-x-0 bottom-0 top-0 grid grid-cols-12 items-end gap-2 px-1">
          {activity.map((week, index) => {
            const total = week.correct + week.wrong;
            const barHeight = total > 0 ? Math.max(5, Math.round((total / maxTotal) * 190)) : 0;
            const knownCorrect = week.easyCorrect + week.mediumCorrect + week.hardCorrect;
            const knownWrong = week.easyWrong + week.mediumWrong + week.hardWrong;
            const segments = [
              { count: week.hardWrong, color: "bg-danger-600" },
              { count: week.mediumWrong + Math.max(0, week.wrong - knownWrong), color: "bg-danger/80" },
              { count: week.easyWrong, color: "bg-danger/55" },
              { count: week.hardCorrect, color: "bg-success-600" },
              { count: week.mediumCorrect + Math.max(0, week.correct - knownCorrect), color: "bg-success/80" },
              { count: week.easyCorrect, color: "bg-success/55" },
            ];
            const showLabel = index === 0 || index === activity.length - 1 || index % 3 === 0;
            return (
              <li key={week.weekStart} className="flex h-full min-w-0 flex-col items-center justify-end">
                <span className="sr-only">{formatWeek(week.weekStart)}: {week.correct} correct, {week.wrong} wrong</span>
                <div className="flex h-[190px] w-full max-w-[36px] flex-col justify-end overflow-hidden rounded-t-[6px] bg-navy/[0.035]">
                  <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[6px]" style={{ height: `${barHeight}px` }}>
                    {segments.map((segment) => (
                      <span
                        key={segment.color}
                        className={segment.color}
                        style={{ height: total > 0 ? `${(segment.count / total) * 100}%` : "0%" }}
                      />
                    ))}
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
          <div className="pointer-events-none absolute inset-x-0 top-[72px] z-10 mx-auto max-w-sm rounded-lg border border-navy/10 bg-white/95 px-5 py-4 text-center">
            <strong className="font-display text-base font-semibold text-navy">No Question Bank attempts yet</strong>
            <p className="mt-1 text-xs leading-5 text-navy/48">Submit an answer to start this chart.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectAnalytics({
  subject,
  topics,
  difficulty,
}: {
  subject: QuestionBankSubject;
  topics: QuestionBankTopic[];
  difficulty: QuestionBankDifficultyMetric[];
}) {
  const copy = SECTION_COPY[subject.section];
  const domainRows = DOMAINS[subject.section].map((domain) =>
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
    <article className="overflow-hidden rounded-xl border border-navy/12 bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-navy/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold text-brand-600">{copy.shortTitle}</p>
          <h3 className="mt-0.5 font-display text-xl font-semibold text-ink">{copy.title}</h3>
        </div>
        <span className="text-xs font-medium text-navy/48">
          {subject.available.toLocaleString()} questions
        </span>
      </header>

      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h4 className="font-display text-base font-semibold text-navy">Accuracy by topic</h4>
            <p className="mt-0.5 text-xs text-navy/40">Attempts and accuracy across every official SAT domain.</p>
          </div>
          <AccuracyLegend />
        </div>

        <div className="space-y-4">
          {domainRows.map((topic) => (
            <div key={topic.domain}>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{topic.domain}</p>
                  <p className="text-[11px] text-navy/40">
                    {topic.attempts.toLocaleString()} attempts · {topic.available.toLocaleString()} available
                  </p>
                </div>
                <strong className={`text-sm ${topic.attempts > 0 ? accuracyColor(topic.accuracy) : "text-navy/30"}`}>
                  {topic.attempts > 0 ? `${topic.accuracy}%` : "-"}
                </strong>
              </div>
              <Meter value={topic.attempts > 0 ? topic.accuracy : 0} />
            </div>
          ))}
        </div>

        <div className="my-6 h-px bg-navy/10" />

        <div>
          <h4 className="font-display text-base font-semibold text-navy">Performance by difficulty</h4>
          <p className="mt-0.5 text-xs text-navy/40">Accuracy and average answer time for Easy, Medium, and Hard questions.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-navy/10">
            {(["easy", "medium", "hard"] as QuestionBankDifficulty[]).map((level, index) => {
              const metric = difficulty.find((item) => item.difficulty === level);
              return (
                <div key={level} className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 ${index > 0 ? "border-t border-navy/10" : ""}`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 flex-none rounded-full ${difficultyDot(level)}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold capitalize text-navy">{level}</p>
                      <p className="text-[10px] text-navy/40">{metric?.attempts ?? 0} attempts</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <strong className="block text-sm text-ink">{metric && metric.attempts > 0 ? `${metric.accuracy}%` : "-"}</strong>
                    <span className="text-[10px] text-navy/35">accuracy</span>
                  </div>
                  <div className="min-w-[62px] text-right">
                    <strong className="block text-sm text-ink">{formatDuration(metric?.averageDurationMs ?? 0)}</strong>
                    <span className="text-[10px] text-navy/35">avg. time</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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

function AccuracyLegend() {
  return (
    <div className="hidden items-center gap-2 text-[9px] font-semibold text-navy/35 sm:flex" aria-label="Accuracy legend">
      <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success" />85%+</span>
      <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-gold" />60–84%</span>
      <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-danger" />&lt;60%</span>
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

function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) return "-";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function meterColor(accuracy: number): string {
  if (accuracy >= 85) return "bg-success";
  if (accuracy >= 60) return "bg-gold";
  return accuracy > 0 ? "bg-danger" : "bg-navy/10";
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 85) return "text-success-600";
  if (accuracy >= 60) return "text-flag";
  return "text-danger-600";
}

function difficultyDot(difficulty: QuestionBankDifficulty): string {
  if (difficulty === "easy") return "bg-sky";
  if (difficulty === "medium") return "bg-brand";
  return "bg-navy";
}

function summaryCellBorder(index: number): string {
  if (index === 0) return "";
  if (index === 1) return "border-t sm:border-l sm:border-t-0";
  if (index === 2) return "border-t xl:border-l xl:border-t-0";
  return "border-t sm:border-l xl:border-t-0";
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

function AttemptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccuracyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 20V10M12 20V4M19 20v-7" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17.4 6.5 21V4.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
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
