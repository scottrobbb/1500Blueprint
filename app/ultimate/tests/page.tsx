import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getTestProgress } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { LockedBadge, LockIcon, UpgradePrompt } from "@/components/account/UpgradePrompt";
import { PLAN_ENTITLEMENTS } from "@/lib/auth/plans";

export const metadata = { title: "Full-Length Tests" };

export default async function UltimateTestsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const isAdmin = isAdminEmail(session.email);
  const [tests, progress, access] = await Promise.all([listTests({ includeDraft: isAdmin }), getTestProgress(session.email), getStudentAccess(session.email)]);
  const availableCount = tests.filter((test, index) => (isAdmin || index < access.entitlements.fullTestLimit) && (test.status === "published" || isAdmin)).length;
  const launchTest = tests.find((test, index) => (isAdmin || index < access.entitlements.fullTestLimit) && (test.status === "published" || isAdmin));
  const scoreProgress = progress.bestScore == null ? 0 : Math.max(0, Math.min(100, ((progress.bestScore - 400) / 1200) * 100));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-9">
      <section className="mb-8 overflow-hidden rounded-xl border border-navy/12 bg-white">
        <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <TestsIcon className="h-5 w-5 text-brand-600" />
              <p className="text-xs font-semibold text-brand-600">Bluebook-style digital SAT</p>
            </div>
            <h1 className="max-w-xl font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-[42px]">
              Full-length practice tests
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-navy/58 sm:text-[15px]">
              Take adaptive modules with SAT timing, a scheduled break, and a score report after you finish.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {launchTest ? (
                <Link
                  href={`/practice-test/${launchTest.slug}?workspace=ultimate`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Start a full test <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : null}
              {progress.testsDone > 0 ? (
                <Link
                  href="/ultimate/tests/completed"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/15 bg-white px-5 text-sm font-semibold text-navy transition-colors hover:border-brand/35 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  View score history <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-navy/10 bg-haze/70 p-5 sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-navy/48">Best score</p>
                <strong className="mt-1 block font-display text-5xl font-semibold tabular-nums tracking-[-0.05em] text-ink">
                  {progress.bestScore?.toLocaleString() ?? "-"}
                </strong>
              </div>
              {progress.improvement != null ? (
                <span className={`mb-1 rounded-full px-2.5 py-1 text-xs font-semibold ${progress.improvement > 0 ? "bg-[#d9fae8] text-[#147a40]" : "bg-white text-navy/58"}`}>
                  {progress.improvement >= 0 ? "+" : ""}{progress.improvement} points
                </span>
              ) : null}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-navy/10">
              <div className="h-full rounded-full bg-brand" style={{ width: `${scoreProgress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-medium text-navy/38"><span>400</span><span>1600</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-navy/10 pt-5">
              <HeroMetric value={progress.testsDone.toLocaleString()} label="tests completed" />
              <HeroMetric value={availableCount.toLocaleString()} label="tests available" />
            </div>
          </div>
        </div>
      </section>

      {access.plan === "free" ? (
        <UpgradePrompt currentPlan="free" requiredPlan="core" title="Core adds a second full-length test" description="Use the free test as a baseline, then compare it with another adaptive score after daily practice." features={["2 full-length tests", "Daily skill drills", "Challenge questions"]} className="mb-8" />
      ) : access.plan === "core" ? (
        <UpgradePrompt currentPlan="core" requiredPlan="max" title="Max adds the full test library" description="Max includes all 4 tests, the complete course library, and a planner that uses your score reports." features={["4 full-length tests", "All advanced courses", "Personal study planner"]} className="mb-8" />
      ) : null}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-600">Test library</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Choose a test</h2>
          <p className="mt-1 text-sm text-navy/55">A full test takes about 2 hours and 14 minutes.</p>
        </div>
        {progress.testsDone > 0 ? (
          <Link href="/ultimate/tests/completed" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/12 bg-white px-4 text-sm font-semibold text-navy transition-colors hover:border-brand/35 hover:text-brand-600">
            All completed tests <ChevronRightIcon className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-gold/30 bg-[#fffaf0] px-4 py-3 text-[12px] font-medium leading-5 text-navy/60">
          <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-gold/20 text-[10px] font-black text-gold-600">A</span>
          <span><strong className="text-navy/75">Admin preview:</strong> unpublished tests are visible for QA. Students only see published tests.</span>
        </div>
      ) : null}

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-10 text-center text-sm text-navy/50">
          No tests are available right now.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tests.map((test, testIndex) => {
            const number = test.slug.match(/(\d+)\s*$/)?.[1] ?? "•";
            const best = progress.bestBySlug[test.slug] ?? null;
            const attempts = progress.countBySlug[test.slug] ?? 0;
            const constructionLocked = test.status !== "published" && !isAdmin;
            const planLocked = testIndex >= access.entitlements.fullTestLimit && !isAdmin;
            const locked = constructionLocked || planLocked;
            const requiredPlan = testIndex < PLAN_ENTITLEMENTS.core.fullTestLimit ? "core" : "max";

            return (
              <li key={test.slug}>
                <article className={`group relative h-full overflow-hidden rounded-xl border bg-white transition-colors duration-200 ${locked ? "border-gold/25" : "border-navy/12 hover:border-brand/35"}`}>
                  <div className={`h-1 w-full ${best != null ? "bg-success" : locked ? "bg-navy/15" : "bg-brand"}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                    <span className={`grid h-10 w-10 flex-none place-items-center rounded-lg border font-display text-lg font-semibold ${locked ? "border-navy/10 bg-haze text-navy/35" : "border-brand/15 bg-ice text-brand-600"}`}>
                      {number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-navy/35">Full adaptive SAT</p>
                          <h3 className="mt-1 font-display text-[18px] font-extrabold leading-tight text-ink">{test.title}</h3>
                        </div>
                        {best != null ? (
                          <div className="flex-none text-right">
                            <strong className="block font-display text-xl font-extrabold leading-none text-success-600">{best}</strong>
                            <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-navy/35">Personal best</span>
                          </div>
                        ) : planLocked ? <LockedBadge plan={requiredPlan} /> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 divide-x divide-navy/10 rounded-xl bg-haze/70 py-3 text-center">
                    <TestDetail value="2h 14m" label="Duration" />
                    <TestDetail value="4" label="Modules" />
                    <TestDetail value={attempts.toString()} label={attempts === 1 ? "Attempt" : "Attempts"} />
                  </div>

                  {locked ? (
                    planLocked ? <Link href="/pricing" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand/20 bg-ice/70 px-4 text-center text-sm font-extrabold text-navy transition-colors hover:border-brand/40 hover:bg-ice"><LockIcon className="h-4 w-4 text-[#7a5900]" />Unlock with {requiredPlan === "core" ? "Core" : "Max"}</Link> : <div className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-navy/[0.05] px-4 text-center text-sm font-bold text-navy/40">Coming soon</div>
                  ) : (
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <Link
                        href={`/practice-test/${test.slug}?workspace=ultimate`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {attempts > 0 ? "Retake" : "Start test"} <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/practice-test/${test.slug}/modules?workspace=ultimate`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/15 px-4 text-sm font-bold text-navy transition-colors hover:bg-haze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        Modules
                      </Link>
                    </div>
                  )}

                  {attempts > 0 && !locked && (
                    <Link href="/ultimate/tests/completed" className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-600 transition-colors hover:text-navy">
                      View {attempts} past {attempts === 1 ? "attempt" : "attempts"} <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <Link href={access.entitlements.dailyDrillLimit === null ? "/pricing" : "/ultimate/drills"} className="group mt-6 flex items-center gap-4 rounded-xl border border-brand/20 bg-ice/40 p-4 text-navy transition-colors hover:border-brand/40 hover:bg-ice sm:p-5">
        <TestsIcon className="h-5 w-5 flex-none text-brand-600" />
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm">{access.entitlements.dailyDrillLimit === null ? "Unlock daily drills with Core" : "Not ready for a full test?"}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-navy/50">{access.entitlements.dailyDrillLimit === null ? "Build one SAT pattern at a time between full-test checkpoints." : "Practice one skill at a time and come back when you have a full testing window."}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong className="block font-display text-xl font-semibold tabular-nums text-navy">{value}</strong>
      <span className="mt-0.5 block text-[10px] font-medium text-navy/42">{label}</span>
    </div>
  );
}

function TestDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <strong className="block font-display text-sm font-extrabold text-navy">{value}</strong>
      <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-navy/35">{label}</span>
    </div>
  );
}
