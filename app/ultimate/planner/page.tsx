import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, DrillsIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getHubState } from "@/lib/gamification/state";

export const metadata = { title: "Study Planner" };

const sessions = [
  { label: "Targeted skill practice", meta: "10–15 minutes", href: "/ultimate/drills", Icon: DrillsIcon },
  { label: "Review recent mistakes", meta: "10 minutes", href: "/ultimate/history", Icon: HistoryIcon },
  { label: "Flashcard review", meta: "10–20 minutes", href: "/ultimate/flashcards", Icon: LayersIcon },
  { label: "Full-length simulation", meta: "2 hours 14 minutes", href: "/ultimate/tests", Icon: TestsIcon },
];

export default async function PlannerPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const hub = await getHubState(session.email);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
      <PageHeader
        eyebrow="Study planner"
        title="Build this week around real practice."
        description="This bridge view uses the live drills, cards, history, and tests. Test-date persistence and Scott-authored schedules can be connected without changing those underlying systems."
      />

      <section className="mb-5 rounded-[18px] bg-[linear-gradient(125deg,#0b2a5b,#174778)] p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky">Today</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{hub.dailyGoal.done} of {hub.dailyGoal.total} daily drills complete</h2>
          <p className="mt-1 text-sm text-white/60">Keep the current {hub.player.streak}-day streak moving.</p>
        </div>
        <Link href="/ultimate/drills" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white sm:mt-0">
          Continue today <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </section>

      <section className="rounded-[18px] border border-navy/10 bg-white p-5 shadow-pop sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-ink">Suggested practice sequence</h2>
            <p className="mt-1 text-xs text-navy/45">A working bridge until personalized schedule storage is added.</p>
          </div>
          <span className="rounded-full bg-haze px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-navy/45">Live links</span>
        </div>

        <div className="mt-5 divide-y divide-navy/10">
          {sessions.map(({ label, meta, href, Icon }, index) => (
            <Link key={href} href={href} className="group flex min-h-[76px] items-center gap-4 py-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-navy text-xs font-extrabold text-white">{index + 1}</span>
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-haze text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block font-display text-sm text-ink">{label}</strong>
                <span className="mt-0.5 block text-xs text-navy/45">{meta}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 text-navy/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
