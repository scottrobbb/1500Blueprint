import Link from "next/link";
import { ChevronRightIcon } from "@/components/shell/icons";
import type { TestProgress } from "@/lib/gamification/state";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";

const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const satDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

function dateValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;
  return timestamp;
}

function todayValue(now = new Date()): number {
  const parts = easternDateFormatter.formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day));
}

function testDateDetails(value: string): { days: number; label: string } | null {
  const timestamp = dateValue(value);
  if (timestamp === null) return null;
  return {
    days: Math.round((timestamp - todayValue()) / 86_400_000),
    label: satDateFormatter.format(new Date(timestamp)),
  };
}

function scoreProgress(current: number, goal: number): number {
  if (goal <= 400) return 100;
  return Math.max(0, Math.min(100, ((current - 400) / (goal - 400)) * 100));
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-navy hover:underline">
      {children}
      <ChevronRightIcon className="h-4 w-4" />
    </Link>
  );
}

export function HomeProgress({
  profile,
  testProgress,
}: {
  profile: StudyPlannerProfile | null;
  testProgress: TestProgress;
}) {
  const testDate = profile ? testDateDetails(profile.testDate) : null;
  const currentScore = profile?.currentScore ?? testProgress.latestScore;
  const goalScore = profile?.goalScore ?? null;
  const bestScore = testProgress.bestScore;

  return (
    <aside aria-label="SAT progress" className="grid self-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <section className={`flex flex-col rounded-xl border border-navy/12 bg-white ${testDate && testDate.days >= 0 ? "min-h-[147px] p-5" : "p-4"}`}>
        <h3 className="text-sm font-medium text-navy/50">SAT date</h3>
        {testDate && testDate.days >= 0 ? (
          <>
            <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-navy">
              {testDate.days === 0 ? "Today" : `${testDate.days} ${testDate.days === 1 ? "day" : "days"}`}
            </p>
            <div className="mt-auto flex items-end justify-between gap-3 pt-3">
              <p className="text-sm text-navy/55">{testDate.label}</p>
              <CardLink href="/settings/study-preferences">Change</CardLink>
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="font-display text-xl font-semibold text-navy">
              {testDate ? "Date passed" : "Not set"}
            </p>
            <CardLink href="/settings/study-preferences">{testDate ? "Update date" : "Set date"}</CardLink>
          </div>
        )}
      </section>

      <section className={`flex flex-col rounded-xl border border-navy/12 bg-white ${currentScore !== null ? "min-h-[147px] p-5" : "p-4"}`}>
        <h3 className="text-sm font-medium text-navy/50">Score</h3>
        {currentScore !== null ? (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-5">
              <div>
                <dt className="text-xs text-navy/45">Current</dt>
                <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-navy">{currentScore}</dd>
              </div>
              <div>
                <dt className="text-xs text-navy/45">{goalScore !== null ? "Goal" : "Best"}</dt>
                <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-navy">
                  {goalScore ?? bestScore ?? "—"}
                </dd>
              </div>
            </dl>
            {goalScore !== null ? (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy/10"
                role="progressbar"
                aria-label="Progress toward score goal"
                aria-valuemin={400}
                aria-valuemax={goalScore}
                aria-valuenow={Math.min(currentScore, goalScore)}
              >
                <div className="h-full rounded-full bg-navy" style={{ width: `${scoreProgress(currentScore, goalScore)}%` }} />
              </div>
            ) : null}
            <div className="mt-auto pt-2">
              <CardLink href="/history">View history</CardLink>
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="font-display text-xl font-semibold text-navy">No score yet</p>
            <CardLink href="/practice-test">Take a practice test</CardLink>
          </div>
        )}
      </section>
    </aside>
  );
}
