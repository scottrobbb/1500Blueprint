import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityIcon } from "@/components/community/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, DrillsIcon, FlameIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { loadHistory } from "@/lib/drills/progress";
import { listStudentLibrary } from "@/lib/flashcards/queries";
import { getHubState, getTestProgress } from "@/lib/gamification/state";

export const metadata = { title: "Home" };

export default async function UltimateHomePage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [hub, testProgress, history, flashcards] = await Promise.all([
    getHubState(session.email),
    getTestProgress(session.email),
    loadHistory(session.email),
    listStudentLibrary(session.email),
  ]);

  const mastered = history.filter((entry) => entry.mastered).length;
  const accuracy = history.length > 0 ? Math.round((mastered / history.length) * 100) : null;
  const dailyProgress = Math.min(100, Math.round((hub.dailyGoal.done / Math.max(1, hub.dailyGoal.total)) * 100));
  const cardCount = [...flashcards.owned, ...flashcards.shared].reduce((sum, set) => sum + set.cardCount, 0);

  return (
    <div>
      <div className="flex min-h-9 items-center justify-between gap-3 bg-navy px-4 py-2 text-[11px] font-semibold text-white/75 sm:px-7">
        <span>Ultimate integration workspace · live student data</span>
        <span className="rounded-full bg-gold px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-navy">
          Private
        </span>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-7 sm:py-9">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Your command center</p>
            <h1 className="mt-1 font-display text-[30px] font-extrabold tracking-[-0.035em] text-ink sm:text-[38px]">
              Welcome back, {hub.player.firstName}.
            </h1>
            <p className="mt-1 text-sm text-navy/50">Pick up where you left off or choose a focused practice path.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-pop">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold-600">
              <FlameIcon className="h-5 w-5" />
            </span>
            <div>
              <strong className="block font-display text-lg leading-none text-navy">{hub.player.streak} days</strong>
              <span className="text-[11px] text-navy/45">current streak</span>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[18px] bg-[linear-gradient(125deg,#0b2a5b_0%,#123d80_62%,#1b5cab_100%)] p-6 text-white shadow-[0_18px_45px_-28px_rgba(11,42,91,0.75)] sm:p-8">
              <div aria-hidden="true" className="absolute -right-12 -top-20 h-60 w-60 rounded-full border-[36px] border-sky/10" />
              <div aria-hidden="true" className="absolute -bottom-24 right-24 h-52 w-52 rounded-full border-[28px] border-brand/10" />
              <div className="relative max-w-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky">Today&apos;s target</p>
                <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.025em] sm:text-[30px]">
                  Complete {Math.max(0, hub.dailyGoal.total - hub.dailyGoal.done)} more focused reps.
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-white/65">
                  Your existing drills, scores, mastery, streak, and XP all continue here from the same student account.
                </p>
                <div className="mt-5 max-w-md">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-white/65">
                    <span>{hub.dailyGoal.done} of {hub.dailyGoal.total} drills</span>
                    <span>{dailyProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${dailyProgress}%` }} />
                  </div>
                </div>
                <Link
                  href="/ultimate/drills"
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px"
                >
                  Start a drill <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-extrabold text-ink">Continue studying</h2>
                <span className="text-xs text-navy/40">All activity stays on the current account</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FeatureCard
                  href="/ultimate/drills"
                  title="Targeted drills"
                  detail={`${history.length} questions attempted`}
                  Icon={DrillsIcon}
                  tone="blue"
                />
                <FeatureCard
                  href="/ultimate/tests"
                  title="Full-length tests"
                  detail={testProgress.bestScore ? `Best score ${testProgress.bestScore}` : "Ready for your first test"}
                  Icon={TestsIcon}
                  tone="navy"
                />
                <FeatureCard
                  href="/ultimate/flashcards"
                  title="Flashcards"
                  detail={`${cardCount} cards across ${flashcards.owned.length + flashcards.shared.length} sets`}
                  Icon={LayersIcon}
                  tone="gold"
                />
                <FeatureCard
                  href="/ultimate/community"
                  title="Community"
                  detail="Questions, wins, and score drops"
                  Icon={CommunityIcon}
                  tone="sky"
                />
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Attempted" value={history.length.toLocaleString()} />
              <Metric label="Mastered" value={mastered.toLocaleString()} />
              <Metric label="Mastery rate" value={accuracy == null ? "—" : `${accuracy}%`} />
              <Metric label="Tests done" value={testProgress.testsDone.toLocaleString()} />
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-[18px] border border-navy/10 bg-white p-5 shadow-pop">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy/40">Score trajectory</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <strong className="font-display text-4xl font-extrabold tracking-[-0.04em] text-navy">
                    {testProgress.bestScore ?? "—"}
                  </strong>
                  <span className="mt-1 block text-xs text-navy/45">best practice score</span>
                </div>
                {testProgress.improvement != null && (
                  <span className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-bold text-success-600">
                    {testProgress.improvement >= 0 ? "+" : ""}{testProgress.improvement}
                  </span>
                )}
              </div>
              <div className="my-5 h-px bg-navy/10" />
              <div className="grid grid-cols-2 gap-3">
                <SmallMetric label="Level" value={String(hub.player.level)} />
                <SmallMetric label="Total XP" value={hub.player.xp.toLocaleString()} />
              </div>
              <Link href="/ultimate/tests" className="mt-5 flex min-h-11 items-center justify-between rounded-xl bg-navy px-4 text-sm font-bold text-white">
                Open test center <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </section>

            <section className="rounded-[18px] border border-gold/35 bg-[#fffaf0] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">Next achievement</p>
              <h3 className="mt-2 font-display text-lg font-extrabold text-navy">
                {hub.achievements.nextUp?.label ?? "Achievement set complete"}
              </h3>
              <p className="mt-1 text-sm leading-5 text-navy/55">
                {hub.achievements.nextUp?.description ?? "You have unlocked every current achievement."}
              </p>
              <div className="mt-4 text-xs font-semibold text-navy/50">
                {hub.achievements.unlocked} of {hub.achievements.total} unlocked
              </div>
            </section>

            <Link
              href="/ultimate/history"
              className="flex min-h-14 items-center gap-3 rounded-[16px] border border-navy/10 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand/35"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-haze text-brand-600">
                <HistoryIcon className="h-5 w-5" />
              </span>
              Review practice history
              <ChevronRightIcon className="ml-auto h-4 w-4 text-navy/35" />
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  href,
  title,
  detail,
  Icon,
  tone,
}: {
  href: string;
  title: string;
  detail: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  tone: "blue" | "navy" | "gold" | "sky";
}) {
  const tones = {
    blue: "bg-brand/10 text-brand-600",
    navy: "bg-navy/10 text-navy",
    gold: "bg-gold/15 text-gold-600",
    sky: "bg-ice text-brand-600",
  };
  return (
    <Link href={href} className="group flex min-h-[92px] items-center gap-4 rounded-[16px] border border-navy/10 bg-white p-4 shadow-pop transition-all hover:-translate-y-0.5 hover:border-brand/35">
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block font-display text-base text-ink">{title}</strong>
        <span className="mt-1 block truncate text-xs text-navy/45">{detail}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 flex-none text-navy/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[15px] border border-navy/10 bg-white p-4 shadow-pop">
      <strong className="font-display text-2xl font-extrabold tracking-tight text-navy">{value}</strong>
      <span className="mt-1 block text-[11px] font-medium text-navy/45">{label}</span>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-haze px-3 py-2.5">
      <strong className="block font-display text-lg text-navy">{value}</strong>
      <span className="text-[10px] text-navy/40">{label}</span>
    </div>
  );
}
