import Link from "next/link";
import type { ModuleAttemptRecord } from "@/lib/sat/moduleAttempts";
import { ArrowRightIcon } from "./icons";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

// Single-module practice history, listed under the full-test history so a
// student can reopen the review of any module they have drilled on its own.
export function ModuleAttemptHistory({
  attempts,
  testTitles,
  reportQuery = "",
  className = "",
}: {
  attempts: ModuleAttemptRecord[];
  testTitles: Record<string, string>;
  reportQuery?: string;
  className?: string;
}) {
  if (attempts.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xl font-black text-navy">Single-module practice</h2>
        <span className="h-px flex-1 bg-shell-200" />
        <span className="text-xs font-semibold text-shell-500">{attempts.length} total</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {attempts.map((attempt) => {
          const pct = attempt.total ? Math.round((attempt.correct / attempt.total) * 100) : 0;
          return (
            <li key={attempt.id}>
              <Link
                href={`/practice-test/${attempt.testSlug}/module/${attempt.moduleKey}/results/${attempt.id}${reportQuery}`}
                className="group flex items-center gap-4 rounded-2xl border border-shell-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-600"
              >
                <div className="flex h-12 w-14 flex-none items-center justify-center rounded-xl bg-ice font-display text-sm font-extrabold tabular-nums text-brand-600">
                  {attempt.correct}/{attempt.total}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-navy">{attempt.label}</p>
                  <p className="mt-0.5 truncate text-xs text-shell-500">
                    {testTitles[attempt.testSlug] ?? attempt.testSlug} · {pct}% correct ·{" "}
                    {dateFormatter.format(new Date(attempt.createdAt))}
                  </p>
                </div>
                <span className="hidden items-center gap-1 text-sm font-bold text-brand-600 sm:inline-flex">
                  Review
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
