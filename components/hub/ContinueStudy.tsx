import Link from "next/link";
import { ChevronRightIcon } from "@/components/shell/icons";
import type { DrillSlug, QuestionStatus } from "@/lib/drills/types";
import type { HomeContinuation } from "@/lib/home/continuation";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function savedLabel(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return "Just now";
  if (absoluteSeconds < 3_600) return relativeTime.format(Math.round(seconds / 60), "minute");
  if (absoluteSeconds < 86_400) return relativeTime.format(Math.round(seconds / 3_600), "hour");
  if (absoluteSeconds < 604_800) return relativeTime.format(Math.round(seconds / 86_400), "day");
  return relativeTime.format(Math.round(seconds / 604_800), "week");
}

function actionLabel(continuation: HomeContinuation): string {
  return continuation.resumeMode === "exact" ? "Resume" : "Open";
}

const STARTER_SKILLS: Array<{ title: string; href: string; slug: DrillSlug }> = [
  { title: "Grammar", href: "/drills/grammar", slug: "grammar" },
  { title: "Reading", href: "/drills/reading", slug: "reading" },
  { title: "Math", href: "/drills/targeted-math?difficulty=medium", slug: "targeted-math" },
  { title: "Vocabulary", href: "/drills/vocab", slug: "vocab" },
];

export function ContinueStudy({
  continuation,
  dailyGoal,
  isAdmin,
  publication,
}: {
  continuation: HomeContinuation | null;
  dailyGoal: { done: number; total: number };
  isAdmin: boolean;
  publication: Partial<Record<DrillSlug, QuestionStatus>>;
}) {
  const saved = continuation ? savedLabel(continuation.updatedAt) : null;
  const starterSkills = STARTER_SKILLS.filter(
    (skill) => isAdmin || publication[skill.slug] === "published",
  );
  const goalProgress = dailyGoal.total > 0
    ? Math.min(100, Math.round((dailyGoal.done / dailyGoal.total) * 100))
    : 0;

  return (
    <article className="flex min-h-[310px] flex-col rounded-xl border border-navy/12 bg-white">
      {continuation ? (
        <div className="flex flex-1 flex-col items-start justify-center px-5 py-8 sm:px-8">
          <p className="text-sm font-medium text-navy/50">Continue where you left off</p>
          <h3 className="mt-2 max-w-xl font-display text-2xl font-semibold leading-tight text-navy">
            {continuation.title}
          </h3>
          <p className="mt-2 text-sm text-navy/55">{continuation.detail}</p>
          {saved ? <p className="mt-1 text-xs text-navy/40">Saved {saved.toLowerCase()}</p> : null}
          <Link
            href={continuation.href}
            className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
          >
            {actionLabel(continuation)}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center px-5 py-8 sm:px-8">
          <h3 className="font-display text-2xl font-semibold text-navy">Practice a skill</h3>
          <p className="mt-2 text-sm text-navy/55">Grammar, reading, math, or vocabulary</p>
          <details className="group relative mt-6">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-700 [&::-webkit-details-marker]:hidden">
              Choose a skill
              <ChevronRightIcon className="h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-navy/12 bg-white">
              {starterSkills.map((skill, index) => (
                <Link
                  key={skill.slug}
                  href={skill.href}
                  className={`flex min-h-11 items-center justify-between px-4 py-3 text-sm font-semibold text-navy transition-colors hover:bg-haze ${
                    index > 0 ? "border-t border-navy/10" : ""
                  }`}
                >
                  {skill.title}
                  <ChevronRightIcon className="h-4 w-4 text-navy/35" />
                </Link>
              ))}
            </div>
          </details>
        </div>
      )}
      <div className="border-t border-navy/10 px-5 py-4 sm:px-8">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium text-navy/55">Daily goal</span>
          <span className="font-semibold tabular-nums text-navy">
            {dailyGoal.done} of {dailyGoal.total} drills
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/10"
          role="progressbar"
          aria-label="Daily drill goal"
          aria-valuemin={0}
          aria-valuemax={dailyGoal.total}
          aria-valuenow={Math.min(dailyGoal.done, dailyGoal.total)}
        >
          <div className="h-full rounded-full bg-navy" style={{ width: `${goalProgress}%` }} />
        </div>
      </div>
    </article>
  );
}
