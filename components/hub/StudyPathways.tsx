import Link from "next/link";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import type { StudyPlannerProfile } from "@/lib/study-planner/profile";

const PATHWAYS = [
  {
    title: "Practice tests",
    description: "Full-length digital SAT practice",
    href: "/practice-test",
    Icon: TestsIcon,
  },
  {
    title: "Flashcards",
    description: "Review saved vocabulary",
    href: "/flashcards",
    Icon: LayersIcon,
  },
  {
    title: "History",
    description: "Past scores and completed sessions",
    href: "/history",
    Icon: HistoryIcon,
  },
] as const;

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17" strokeLinecap="round" />
      <path d="m8 15 2.1 2.1L16 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTestDate(testDate: string) {
  const date = new Date(`${testDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "your SAT date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type StudyPathwaysProps = {
  profile: StudyPlannerProfile | null;
  plan: string | null;
};

export function StudyPathways({ profile, plan }: StudyPathwaysProps) {
  const hasPlannerAccess = plan === "max";
  const hasActivePlan = hasPlannerAccess && Boolean(profile?.activePlanId);
  const title = hasActivePlan
    ? "Your study plan is ready"
    : hasPlannerAccess
      ? "Create your SAT study plan"
      : "Build a plan around your SAT date";
  const description = hasActivePlan && profile
    ? `${formatTestDate(profile.testDate)} test date · ${profile.goalScore.toLocaleString()} goal · ${profile.dailyMinutes} min per study day. See what to work on next.`
    : hasPlannerAccess
      ? "Tell us your test date, goal score, and weekly availability. We’ll turn them into a focused plan you can follow."
      : "Turn your goal score and weekly availability into a focused schedule. Study Planner is included with Max.";
  const action = hasActivePlan ? "View this week" : hasPlannerAccess ? "Create my plan" : "Explore Study Planner";

  return (
    <section aria-labelledby="study-pathways-heading" className="mx-auto w-full max-w-[1080px] px-4 pt-9 sm:px-6">
      <h2 id="study-pathways-heading" className="mb-3 font-display text-lg font-semibold text-navy">
        More ways to study
      </h2>
      <Link
        href="/ultimate/planner"
        className="group grid overflow-hidden rounded-2xl border border-brand/25 bg-[linear-gradient(110deg,#ffffff_0%,#ffffff_58%,#ebf7ff_100%)] shadow-[0_10px_30px_rgba(11,42,91,0.05)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-[0_14px_36px_rgba(11,42,91,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:grid-cols-[minmax(0,1fr)_300px]"
      >
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-brand text-white">
            <CalendarIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-bold text-navy sm:text-2xl">{title}</span>
            <span className="mt-2 block max-w-2xl text-sm leading-6 text-navy/60">{description}</span>
            <span className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white transition-colors group-hover:bg-navy-700">
              {action}
              <ChevronRightIcon className="h-4 w-4" />
            </span>
          </span>
        </div>

        <span className="relative hidden min-h-52 overflow-hidden border-l border-brand/10 sm:block" aria-hidden="true">
          <span className="absolute left-8 top-6 w-[244px] rotate-2 rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_12px_30px_rgba(11,42,91,0.10)] transition-transform group-hover:rotate-0">
            <span className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-navy">This week</span>
              <span className="text-xs font-semibold text-brand-600">3 sessions</span>
            </span>
            <span className="mt-4 grid grid-cols-5 gap-2">
              {[
                ["M", true],
                ["T", false],
                ["W", true],
                ["T", false],
                ["F", true],
              ].map(([day, active], index) => (
                <span key={`${day}-${index}`} className="text-center">
                  <span className="block text-[10px] font-semibold text-navy/40">{day}</span>
                  <span className={`mx-auto mt-1.5 block h-7 w-7 rounded-full ${active ? "bg-brand" : "bg-haze"}`} />
                </span>
              ))}
            </span>
            <span className="mt-4 block rounded-lg bg-haze p-3">
              <span className="block h-2 w-20 rounded-full bg-navy/20" />
              <span className="mt-2 block h-2 w-32 rounded-full bg-brand/25" />
            </span>
          </span>
        </span>
      </Link>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {PATHWAYS.map(({ title, description, href, Icon }) => (
          <Link
            key={title}
            href={href}
            className="group flex min-h-32 flex-col rounded-xl border border-navy/12 bg-white p-5 transition-colors hover:border-navy/25 hover:bg-navy/[0.02]"
          >
            <div className="flex items-start justify-between gap-4">
              <Icon className="h-5 w-5 text-navy/55" />
              <ChevronRightIcon className="h-4 w-4 text-navy/35 group-hover:text-navy" />
            </div>
            <h3 className="mt-5 font-semibold text-navy">{title}</h3>
            <p className="mt-1 text-sm text-navy/50">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
