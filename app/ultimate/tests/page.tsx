import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import { TestLibraryCard } from "@/components/test/TestLibraryCard";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { FREE_PRACTICE_TEST_SLUG } from "@/lib/auth/access-control";
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
  const launchTest = tests.find((test, index) =>
    (isAdmin || index < access.entitlements.fullTestLimit)
    && (test.status === "published" || isAdmin),
  );
  const scoreProgress = progress.bestScore == null
    ? 0
    : Math.max(0, Math.min(100, ((progress.bestScore - 400) / 1200) * 100));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-9">
      <section className="relative mb-8 overflow-hidden rounded-[22px] bg-navy text-white shadow-[0_18px_50px_-30px_rgba(11,42,91,0.85)]">
        <div aria-hidden="true" className="absolute -right-20 -top-28 h-80 w-80 rounded-full border-[46px] border-sky/[0.08]" />
        <div aria-hidden="true" className="absolute bottom-0 right-[31%] h-32 w-32 translate-y-1/2 rounded-full border-[22px] border-brand/[0.08]" />
        <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:p-10">
          <div>
            <div className="mb-5 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-sky">
                <TestsIcon className="h-5 w-5" />
              </span>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky">Bluebook-style digital SAT</p>
            </div>
            <h1 className="max-w-xl font-display text-[34px] font-extrabold leading-[1.03] tracking-[-0.04em] sm:text-[44px]">Practice the real test, not just the questions.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/62 sm:text-[15px]">Full adaptive modules, official timing, a built-in break, and detailed score reports in a focused exam workspace.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {launchTest ? <Link href={`/practice-test/${launchTest.slug}?workspace=ultimate`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-colors hover:bg-[#4db2f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Start a full test <ChevronRightIcon className="h-4 w-4" /></Link> : null}
              {progress.testsDone > 0 ? <Link href="/ultimate/tests/completed" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-5 text-sm font-bold text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">View score history <ChevronRightIcon className="h-4 w-4" /></Link> : null}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Your best score</p><strong className="mt-1 block font-display text-5xl font-extrabold tracking-[-0.05em]">{progress.bestScore?.toLocaleString() ?? "-"}</strong></div>
              {progress.improvement != null ? <span className={`mb-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${progress.improvement > 0 ? "bg-[#d9fae8] text-[#147a40]" : "bg-white/10 text-white/65"}`}>{progress.improvement >= 0 ? "+" : ""}{progress.improvement} points</span> : null}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky" style={{ width: `${scoreProgress}%` }} /></div>
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-white/35"><span>400</span><span>1600</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
              <HeroMetric value={progress.testsDone.toLocaleString()} label="tests completed" />
              <HeroMetric value={availableCount.toLocaleString()} label="tests available" />
            </div>
          </div>
        </div>
      </section>

      <nav className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-navy/10 bg-white p-1.5 shadow-pop" aria-label="Practice test views">
        <span aria-current="page" className="inline-flex min-h-10 items-center rounded-xl bg-navy px-4 text-sm font-bold text-white">Full tests <span className="ml-2 text-white/55">{tests.length}</span></span>
        <Link href="/ultimate/tests/completed" className="inline-flex min-h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-bold text-navy/55 transition-colors hover:bg-ice hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Score history <span className="ml-2 text-navy/30">{progress.testsDone}</span></Link>
      </nav>

      <section className="mb-7 rounded-[18px] border border-brand/20 bg-ice/50 p-5 shadow-pop sm:p-6" aria-labelledby="test-day-note">
        <div className="flex items-start gap-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand text-white"><TestDayIcon /></span>
          <div>
            <h2 id="test-day-note" className="font-display text-lg font-extrabold tracking-[-0.02em] text-navy">Set aside a real testing window</h2>
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
          <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">Test library</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Choose your next test</h2>
        </div>
        {resumableSlugs.size > 0 ? <p className="text-xs font-medium text-navy/45">{resumableSlugs.size} test{resumableSlugs.size === 1 ? "" : "s"} ready to resume</p> : null}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-navy/15 bg-white p-10 text-center text-sm text-navy/50 shadow-pop">No tests are available right now.</div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {tests.map((test, testIndex) => {
            const bestScore = progress.bestBySlug[test.slug] ?? null;
            const attempts = progress.countBySlug[test.slug] ?? 0;
            const constructionLocked = test.status !== "published" && !isAdmin;
            const planLocked = test.slug !== FREE_PRACTICE_TEST_SLUG && testIndex >= access.entitlements.fullTestLimit && !isAdmin;
            // Every paywalled test now points Free users at Max -- Core is
            // never offered as a standalone upgrade target in the app.
            const requiredPlan = "max";

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
        <UpgradePrompt currentPlan="free" requiredPlan="max" title="Max unlocks the full test library" description="Use the free test as a baseline, then compare it against 4 more adaptive scores with unlimited daily practice." features={["5 full-length tests", "Unlimited daily drills", "Challenge questions"]} className="mt-8" />
      ) : access.plan === "core" ? (
        <UpgradePrompt currentPlan="core" requiredPlan="max" title="Max adds the full test library" description="Max includes all 5 tests, the complete course library, and a planner that uses your score reports." features={["5 full-length tests", "All advanced courses", "Personal study planner"]} className="mt-8" />
      ) : null}

      <Link href={access.entitlements.dailyDrillLimit === null ? "/pricing" : "/ultimate/drills"} className="group mt-6 flex cursor-pointer items-center gap-4 rounded-[18px] border border-brand/20 bg-ice/50 p-4 text-navy shadow-pop transition-colors hover:border-brand/40 hover:bg-ice sm:p-5">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white text-brand-600 shadow-sm"><TestsIcon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm font-semibold">{access.entitlements.dailyDrillLimit === null ? "Unlock daily drills with Max" : "Not ready for a full test?"}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-navy/50">{access.entitlements.dailyDrillLimit === null ? "Build one SAT pattern at a time between full-test checkpoints." : "Practice one skill at a time and return when you have a full testing window."}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return <div><strong className="block font-display text-xl font-extrabold text-white">{value}</strong><span className="mt-0.5 block text-[10px] font-medium text-white/40">{label}</span></div>;
}

function TestDayIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="13" rx="2" /><path d="M8 9h8M8 13h5" strokeLinecap="round" /><path d="m15.5 15.5 1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
