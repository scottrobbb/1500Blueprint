import Link from "next/link";
import type { ProgressActivityItem, QuestionProgressSource, StudentProgress } from "@/lib/progress/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

function percent(value: number | null): string {
  return value == null ? "-" : `${value}%`;
}

function signed(value: number | null): string {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function ProgressOverview({
  progress,
  variant = "dashboard",
}: {
  progress: StudentProgress;
  variant?: "dashboard" | "history";
}) {
  const full = variant === "history";
  const recent = progress.recentActivity.slice(0, full ? 10 : 4);
  const lessonValue = progress.lessons.total > 0
    ? `${progress.lessons.completed}/${progress.lessons.total}`
    : progress.lessons.completed.toString();

  return (
    <section aria-labelledby={`progress-${variant}-title`} className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-600">Progress</p>
          <h2 id={`progress-${variant}-title`} className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">
            {full ? "All saved activity" : "Current totals"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-navy/55">Attempts count every submitted answer. Drill totals also show unique questions.</p>
        </div>
        {!full ? <Link href="/ultimate/history" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-ice hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">View history →</Link> : null}
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-navy/12 bg-white lg:grid-cols-4 lg:divide-x lg:divide-navy/10">
        <MetricCard label="Lessons completed" value={lessonValue} detail={progress.lessons.total > 0 ? `${Math.max(0, progress.lessons.total - progress.lessons.completed)} remaining` : "Saved completions"} />
        <MetricCard label="Questions attempted" value={progress.questions.attempted.toLocaleString()} detail={`${progress.questions.correct} correct · ${progress.questions.incorrect} incorrect`} />
        <MetricCard label="Answer accuracy" value={percent(progress.questions.accuracy)} detail="Across the sources below" />
        <MetricCard label="Latest test score" value={progress.tests.latestScore?.toLocaleString() ?? "-"} detail={progress.tests.count > 0 ? `${progress.tests.count} completed ${progress.tests.count === 1 ? "test" : "tests"}` : "No completed test yet"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3" aria-label="Question progress by source">
        {progress.questions.sources.map((source) => <SourceCard key={source.key} source={source} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-navy/12 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold text-brand-600">Practice tests</p><h3 className="mt-1 font-display text-lg font-semibold text-navy">Score history</h3></div>
            <Link href="/ultimate/tests/completed" className="inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 hover:text-navy">Reports →</Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <SmallMetric label="Latest" value={progress.tests.latestScore?.toLocaleString() ?? "-"} />
            <SmallMetric label="Best" value={progress.tests.bestScore?.toLocaleString() ?? "-"} />
            <SmallMetric label="Completed" value={progress.tests.count.toLocaleString()} />
            <SmallMetric label="Improvement" value={signed(progress.tests.improvement)} suffix={progress.tests.improvement == null ? undefined : " pts"} />
          </dl>
          <div className="mt-4 border-t border-navy/10 pt-4">
            <div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-navy">Drill history</span><span className="text-navy/50">{progress.drills.sessions} sessions · {progress.drills.uniqueQuestions} unique questions</span></div>
            {full && progress.drills.recentSessions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {progress.drills.recentSessions.slice(0, 5).map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-3 rounded-md bg-haze/70 px-3 py-2.5 text-xs">
                    <span className="min-w-0"><strong className="block truncate text-navy">{session.title}</strong><span className="text-navy/45">{dateFormatter.format(new Date(session.createdAt))}</span></span>
                    <span className="flex-none font-extrabold text-navy/65">{session.correct != null && session.total != null ? `${session.correct}/${session.total}` : session.score != null ? `${session.score}%` : "Saved"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-navy/12 bg-white p-5">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-brand-600">Timeline</p><h3 className="mt-1 font-display text-lg font-semibold text-navy">Recent activity</h3></div><span className="text-xs font-medium text-navy/38">Newest first</span></div>
          {recent.length > 0 ? (
            <ul className="mt-3 divide-y divide-navy/10">
              {recent.map((item) => <ActivityRow key={item.id} item={item} />)}
            </ul>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-navy/15 bg-haze/50 px-4 py-6 text-center text-sm text-navy/50">Your completed lessons, practice answers, drills, and tests will appear here.</div>
          )}
        </article>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="min-w-0 border-b border-r border-navy/10 p-4 last:border-r-0 sm:p-5 lg:border-b-0">
      <p className="text-[11px] font-medium text-navy/48">{label}</p>
      <strong className="mt-2 block truncate font-display text-2xl font-semibold tabular-nums text-navy sm:text-3xl">{value}</strong>
      <p className="mt-1 truncate text-[11px] text-navy/48 sm:text-xs">{detail}</p>
    </article>
  );
}

function SourceCard({ source }: { source: QuestionProgressSource }) {
  return (
    <article className="rounded-xl border border-navy/12 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-navy">{source.label}</h3><span className="text-xs font-semibold text-brand-700">{percent(source.accuracy)}</span></div>
      <dl className="mt-3 grid grid-cols-3 divide-x divide-navy/10 border-y border-navy/10 py-2.5 text-center">
        <SmallMetric label="Attempted" value={source.attempted.toLocaleString()} compact />
        <SmallMetric label="Correct" value={source.correct.toLocaleString()} compact />
        <SmallMetric label="Incorrect" value={source.incorrect.toLocaleString()} compact />
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-navy/45">{source.definition}</p>
    </article>
  );
}

function SmallMetric({ label, value, suffix, compact = false }: { label: string; value: string; suffix?: string; compact?: boolean }) {
  return (
    <div className={compact ? "px-1.5" : "rounded-md bg-haze/65 px-3 py-2.5"}>
      <dt className="text-[10px] font-medium text-navy/42">{label}</dt>
      <dd className={`mt-1 font-display font-semibold tabular-nums text-navy ${compact ? "text-sm" : "text-lg"}`}>{value}{suffix}</dd>
    </div>
  );
}

function ActivityRow({ item }: { item: ProgressActivityItem }) {
  const tone = item.outcome === "positive" ? "bg-success text-white" : item.outcome === "negative" ? "bg-danger text-white" : "bg-brand text-white";
  return (
    <li>
      <Link href={item.href} className="group flex min-h-14 items-center gap-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${tone}`} />
        <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-navy group-hover:text-brand-700">{item.title}</strong><span className="mt-0.5 block truncate text-[11px] text-navy/45">{item.detail}</span></span>
        <time dateTime={item.occurredAt} className="flex-none text-[10px] font-semibold text-navy/35">{dateFormatter.format(new Date(item.occurredAt))}</time>
      </Link>
    </li>
  );
}
