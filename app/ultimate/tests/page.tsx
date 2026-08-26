import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import { TestLibraryCard } from "@/components/test/TestLibraryCard";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { PLAN_ENTITLEMENTS } from "@/lib/auth/plans";
import { getTestProgress } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";
import { listResumableTestSlugs } from "@/lib/sat/testSession";

export const metadata = { title: "Full-Length Tests" };

export default async function UltimateTestsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const isAdmin = isAdminEmail(session.email);
  const [tests, progress, access] = await Promise.all([
    listTests({ includeDraft: isAdmin }),
    getTestProgress(session.email),
    getStudentAccess(session.email),
  ]);
  const resumableSlugs = await listResumableTestSlugs(session.email, tests.map((test) => test.slug));
  const availableCount = tests.filter((test, index) =>
    (isAdmin || index < access.entitlements.fullTestLimit)
    && (test.status === "published" || isAdmin),
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
      <header className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-brand/15 bg-ice text-brand-600">
                <TestsIcon className="h-5 w-5" />
              </span>
              <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-[42px]">Full-length practice tests</h1>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-navy/58 sm:text-[15px]">Take a complete adaptive Digital SAT with real timing, a scheduled break, and a detailed score report.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-navy/48" aria-label="Testing summary">
            <SummaryItem value={availableCount.toLocaleString()} label="available" />
            <SummaryItem value={progress.testsDone.toLocaleString()} label="completed" />
            <SummaryItem value={progress.bestScore?.toLocaleString() ?? "—"} label="best score" />
          </div>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-navy/10 pb-4" aria-label="Practice test views">
        <span aria-current="page" className="inline-flex min-h-10 items-center rounded-lg bg-navy px-4 text-sm font-semibold text-white">Full tests <span className="ml-2 text-white/55">{tests.length}</span></span>
        <Link href="/ultimate/tests/completed" className="inline-flex min-h-10 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold text-navy/55 transition-colors hover:bg-white hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Score history <span className="ml-2 text-navy/30">{progress.testsDone}</span></Link>
      </nav>

      <section className="mb-7 rounded-xl border border-brand/20 bg-white p-5 sm:p-6" aria-labelledby="test-day-note">
        <div className="flex items-start gap-4">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-ice text-brand-600"><TestDayIcon /></span>
          <div>
            <h2 id="test-day-note" className="font-display text-lg font-semibold tracking-[-0.02em] text-navy">Set aside a real testing window</h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-navy/58">Each test runs through four timed modules with an adaptive second module and a scheduled break. Plan for about 2 hours and 14 minutes; if you need to leave, your in-progress test can be resumed.</p>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-gold/30 bg-[#fffaf0] px-4 py-3 text-[12px] font-medium leading-5 text-navy/60">
          <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-gold/20 text-[10px] font-black text-gold-600">A</span>
          <span><strong className="text-navy/75">Admin preview:</strong> unpublished tests are visible for QA. Students only see published tests.</span>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-600">Test library</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Choose your next test</h2>
        </div>
        {resumableSlugs.size > 0 ? <p className="text-xs font-medium text-navy/45">{resumableSlugs.size} test{resumableSlugs.size === 1 ? "" : "s"} ready to resume</p> : null}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-navy/15 bg-white p-10 text-center text-sm text-navy/50">No tests are available right now.</div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {tests.map((test, testIndex) => {
            const bestScore = progress.bestBySlug[test.slug] ?? null;
            const attempts = progress.countBySlug[test.slug] ?? 0;
            const constructionLocked = test.status !== "published" && !isAdmin;
            const planLocked = testIndex >= access.entitlements.fullTestLimit && !isAdmin;
            const requiredPlan = testIndex < PLAN_ENTITLEMENTS.core.fullTestLimit ? "core" : "max";

            return (
              <li key={test.slug}>
                <TestLibraryCard
                  slug={test.slug}
                  title={test.title}
                  index={testIndex}
                  attempts={attempts}
                  bestScore={bestScore}
                  resumable={resumableSlugs.has(test.slug)}
                  locked={constructionLocked || planLocked}
                  planLocked={planLocked}
                  requiredPlan={requiredPlan}
                  draft={test.status !== "published"}
                />
              </li>
            );
          })}
        </ul>
      )}

      {access.plan === "free" ? (
        <UpgradePrompt currentPlan="free" requiredPlan="core" title="Core adds a second full-length test" description="Use the free test as a baseline, then compare it with another adaptive score after daily practice." features={["2 full-length tests", "Daily skill drills", "Challenge questions"]} className="mt-8" />
      ) : access.plan === "core" ? (
        <UpgradePrompt currentPlan="core" requiredPlan="max" title="Max adds the full test library" description="Max includes all 4 tests, the complete course library, and a planner that uses your score reports." features={["4 full-length tests", "All advanced courses", "Personal study planner"]} className="mt-8" />
      ) : null}

      <Link href={access.entitlements.dailyDrillLimit === null ? "/pricing" : "/ultimate/drills"} className="group mt-6 flex cursor-pointer items-center gap-4 rounded-xl border border-navy/12 bg-white p-4 text-navy transition-colors hover:border-brand/35 sm:p-5">
        <TestsIcon className="h-5 w-5 flex-none text-brand-600" />
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm font-semibold">{access.entitlements.dailyDrillLimit === null ? "Unlock daily drills with Core" : "Not ready for a full test?"}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-navy/50">{access.entitlements.dailyDrillLimit === null ? "Build one SAT pattern at a time between full-test checkpoints." : "Practice one skill at a time and return when you have a full testing window."}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function SummaryItem({ value, label }: { value: string; label: string }) {
  return <span><strong className="font-display text-base font-semibold tabular-nums text-navy">{value}</strong><span className="ml-1.5">{label}</span></span>;
}

function TestDayIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="13" rx="2" /><path d="M8 9h8M8 13h5" strokeLinecap="round" /><path d="m15.5 15.5 1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
