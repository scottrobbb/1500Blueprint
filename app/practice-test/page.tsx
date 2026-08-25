import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { ChevronRightIcon } from "@/components/shell/icons";
import { listTests } from "@/lib/sat/loadTest";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { getNavStats, getTestProgress } from "@/lib/gamification/state";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { PlanBadge } from "@/components/account/PlanBadge";

export const metadata = {
  title: "Practice Tests · 1500 SAT Blueprint",
  description:
    "Choose a full-length, Bluebook-style digital SAT practice test from the 1500 SAT Blueprint.",
};

function parseTest(slug: string, title: string) {
  const num = slug.match(/(\d+)\s*$/)?.[1] ?? "";
  const form = title.match(/\(([^)]+)\)/)?.[1];
  return { num, label: num ? `Practice Test ${num}` : title, form };
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-navy/[0.06] px-2 py-[3px] text-[11px] font-semibold text-navy/65">{children}</span>
  );
}

function HeroStat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div>
      <div className={`font-display text-[22px] font-extrabold ${gold ? "text-gold" : "text-white"}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-sky">{label}</div>
    </div>
  );
}

export default async function PracticeTestsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = isAdminEmail(session.email);

  const [tests, nav, progress, access] = await Promise.all([
    listTests({ includeDraft: isAdmin }),
    getNavStats(session.email),
    getTestProgress(session.email),
    getStudentAccess(session.email),
  ]);

  const bestScore = progress.bestScore != null ? progress.bestScore.toLocaleString() : "—";
  const sinceFirst =
    progress.improvement != null ? `${progress.improvement >= 0 ? "+" : ""}${progress.improvement}` : "—";

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="tests" stats={nav} />

      {/* hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(110deg,transparent 36%,rgba(124,203,255,0.22) 44%,transparent 52%)," +
            "linear-gradient(130deg,#07193b 0%,#0b2a5b 42%,#1b46a8 74%,#0b2a5b 100%)",
        }}
      >
        <div className="mx-auto w-full max-w-[980px] px-5 pb-9 pt-[30px] sm:px-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky">Bluebook-style digital SAT</div>
          <div className="mt-3 h-0.5 w-[46px] bg-gold" />
          <h1 className="mt-3.5 font-display text-[28px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[38px] sm:leading-[1.05]">
            Full-length practice tests
          </h1>
          <p className="mt-2.5 max-w-[560px] text-[15px] leading-[1.55] text-white/70">
            Each one mirrors the real College Board Bluebook: timed adaptive modules, the same on-screen tools, and a full
            score report when you finish.
          </p>
          {progress.testsDone > 0 && (
            <div className="mt-[18px] flex flex-wrap items-center gap-3">
              <div className="inline-flex gap-[18px] rounded-xl border border-white/15 bg-white/[0.08] px-5 py-[13px]">
                <HeroStat value={bestScore} label="Best score" />
                <div className="w-px bg-white/[0.18]" />
                <HeroStat value={String(progress.testsDone)} label="Tests done" />
                <div className="w-px bg-white/[0.18]" />
                <HeroStat value={sinceFirst} label="Since test 1" gold />
              </div>
              <Link
                href="/practice-test/completed"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/25 bg-white px-4 text-[13px] font-bold text-navy transition-colors hover:bg-blue-50"
              >
                View completed tests
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[980px] px-6 pb-12 pt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-ice px-4 py-3"><div className="flex items-center gap-2.5"><PlanBadge plan={access.plan} test={access.isTestAccount} /><span className="text-xs font-semibold text-navy/55">Includes {access.entitlements.fullTestLimit} full-length {access.entitlements.fullTestLimit === 1 ? "test" : "tests"}</span></div>{access.plan !== "max" ? <Link href="/pricing" className="text-xs font-extrabold text-brand-700">Unlock more →</Link> : null}</div>
        {isAdmin && tests.some((test) => test.status === "draft") ? (
          <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-[13px] font-semibold text-navy/70">
            Draft tests are shown for admin QA. Students only see tests marked Published in the admin editor.
          </div>
        ) : null}
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-navy/55">Choose a test</h2>
          <span className="h-px flex-1 bg-navy/12" />
          <span className="text-xs text-navy/45">
            {tests.length} {tests.length === 1 ? "test" : "tests"}
          </span>
        </div>

        {tests.length === 0 ? (
          <div className="rounded-xl border border-navy/15 bg-white p-8 text-center text-navy/60">
            No tests are available right now. Please check back soon.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {tests.map((t, testIndex) => {
              const { num, label } = parseTest(t.slug, t.title);
              const best = progress.bestBySlug[t.slug] ?? null;
              const count = progress.countBySlug[t.slug] ?? 0;
              const planLocked = testIndex >= access.entitlements.fullTestLimit && !isAdmin;
              const constructionLocked = t.status !== "published" && !isAdmin;
              const locked = constructionLocked || planLocked;
              const cardContent = (
                <>
                  <div
                    className={`flex h-12 w-12 flex-none items-center justify-center rounded-[10px] font-display text-xl font-extrabold text-white ${
                      locked ? "bg-navy/45" : "bg-navy"
                    }`}
                  >
                    {num || "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-display text-base font-bold ${locked ? "text-ink/60" : "text-ink"}`}>{label}</h3>
                    <div className="mt-[7px] flex flex-wrap gap-1.5">
                      <Chip>R&amp;W + Math</Chip>
                      <Chip>4 modules</Chip>
                      <Chip>~2h 14m</Chip>
                      {locked ? (
                        <span className="rounded-md bg-navy/10 px-2 py-[3px] text-[11px] font-bold text-navy/50">
                          {constructionLocked ? "Coming soon" : "Locked"}
                        </span>
                      ) : best ? (
                        <span className="rounded-md bg-success-bg px-2 py-[3px] text-[11px] font-bold text-success-600">
                          Best {best}
                        </span>
                      ) : (
                        <span className="rounded-md bg-navy/[0.06] px-2 py-[3px] text-[11px] font-semibold text-navy/45">
                          Not started
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`ml-auto inline-flex flex-none items-center gap-1.5 rounded-lg px-4 py-[9px] text-[13.5px] font-bold ${
                      locked
                        ? "border border-navy/15 bg-navy/[0.04] text-navy/40"
                        : "bg-navy text-white transition-colors group-hover:bg-navy-700"
                    }`}
                  >
                    {locked ? (constructionLocked ? "Coming soon" : "Locked") : best ? "Retake" : "Start"}
                    {!locked && <ChevronRightIcon className="h-3.5 w-3.5" />}
                  </span>
                </>
              );
              return (
                <li key={t.slug} className="flex flex-col">
                  {locked ? (
                    <div
                      aria-disabled="true"
                      className="flex items-center gap-[15px] rounded-xl border border-dashed border-navy/15 bg-navy/[0.03] p-[18px] opacity-70 grayscale"
                    >
                      {cardContent}
                    </div>
                  ) : (
                    <Link
                      href={`/practice-test/${t.slug}`}
                      className="group flex items-center gap-[15px] rounded-xl border border-navy/15 border-t-2 border-t-brand bg-white p-[18px] transition-colors hover:border-navy/30"
                    >
                      {cardContent}
                    </Link>
                  )}
                  {locked ? (
                    <div className="mt-1.5 px-1 text-xs font-semibold text-navy/40">{planLocked ? "Upgrade your plan to unlock" : "Coming soon"}</div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
                      <Link
                        href={`/practice-test/${t.slug}/modules`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-navy/55 hover:text-navy"
                      >
                        Practice a single module
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </Link>
                      {count > 0 && (
                        <Link
                          href={`/practice-test/${t.slug}/attempts`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-navy/55 hover:text-navy"
                        >
                          View {count} past {count === 1 ? "attempt" : "attempts"}
                          <ChevronRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* drills cross-link */}
        <Link
          href="/drills"
          className="mt-4 flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed border-gold/50 bg-gold/[0.06] p-[18px] transition-colors hover:bg-gold/10"
        >
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[10px] bg-gold/15 text-gold-600">
            <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9z" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-ink">Short on time? Run a Drill instead</h3>
            <p className="mt-1 text-[13.5px] text-navy/60">
              Targeted skill reps with instant AI feedback. Earn XP without the 2-hour commitment.
            </p>
          </div>
          <span className="hidden font-display text-sm font-bold text-brand-600 sm:inline">Go to Drills →</span>
        </Link>
      </main>

      <footer className="mx-auto w-full max-w-[980px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 SAT Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </div>
  );
}
