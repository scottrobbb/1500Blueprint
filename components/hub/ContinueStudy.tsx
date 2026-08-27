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
  isAdmin,
  publication,
}: {
  continuation: HomeContinuation | null;
  isAdmin: boolean;
  publication: Partial<Record<DrillSlug, QuestionStatus>>;
}) {
  const saved = continuation ? savedLabel(continuation.updatedAt) : null;
  const starterSkills = STARTER_SKILLS.filter(
    (skill) => isAdmin || publication[skill.slug] === "published",
  );

  return (
    <section aria-labelledby="continue-study-heading" className="mx-auto w-full max-w-[1000px] px-4 pt-8 sm:px-6">
      <h2 id="continue-study-heading" className="mb-3 font-display text-lg font-semibold text-navy">
        {continuation ? "Continue" : "Start studying"}
      </h2>
      {continuation ? (
        <Link
          href={continuation.href}
          className="group flex min-h-24 items-center justify-between gap-5 rounded-xl border border-navy/12 bg-white px-5 py-5 transition-colors hover:border-navy/25 hover:bg-navy/[0.02] sm:px-6"
        >
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-navy">{continuation.title}</span>
            <span className="mt-1 block truncate text-sm text-navy/55">{continuation.detail}</span>
            {saved ? <span className="mt-0.5 block text-xs text-navy/40">{saved}</span> : null}
          </span>
          <span className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-navy">
            {actionLabel(continuation)}
            <ChevronRightIcon className="h-4 w-4" />
          </span>
        </Link>
      ) : (
        <div className="flex min-h-24 flex-col items-start justify-between gap-5 rounded-xl border border-navy/12 bg-white px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-navy">Practice a skill</h3>
            <p className="mt-1 text-sm text-navy/55">Grammar, reading, math, or vocabulary</p>
          </div>
          <details className="group relative">
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
    </section>
  );
}
