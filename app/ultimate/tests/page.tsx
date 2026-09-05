import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import { TestLibraryCard } from "@/components/test/TestLibraryCard";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { testIndexIsAccessible } from "@/lib/auth/access-control";
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
    (isAdmin || testIndexIsAccessible(test.slug, index, access.entitlements.fullTestLimit))
    && (test.status === "published" || isAdmin),
  ).length;
  const launchTest = tests.find((test, index) =>
    (isAdmin || testIndexIsAccessible(test.slug, index, access.entitlements.fullTestLimit))
    && (test.status === "published" || isAdmin),
  );
  const scoreProgress = progress.bestScore == null
    ? 0
    : Math.max(0, Math.min(100, ((progress.bestScore - 400) / 1200) * 100));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-ink sm:text-[32px]">Full-length tests</h1>
          {/* The testing-window banner said this; a page needs the fact, not a
              card around it. */}
          <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/55">
            Four timed modules with an adaptive second module and a scheduled break, about 2 hours 14 minutes. An in-progress test can be resumed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {progress.testsDone > 0 ? (
            <Link href="/ultimate/tests/completed" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-navy/30">
              Score history <span className="text-navy/35">{progress.testsDone}</span>
            </Link>
          ) : null}
          {launchTest ? (
            <Link href={`/practice-test/${launchTest.slug}?workspace=ultimate`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600">
              Start a full test <ChevronRightIcon className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Test progress">
        <div className="flex flex-col rounded-2xl border border-navy/10 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-navy/55">Best score</h2>
            {progress.improvement != null ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${progress.improvement > 0 ? "bg-success-bg text-success-600" : "bg-haze text-navy/50"}`}>
                {progress.improvement >= 0 ? "+" : ""}{progress.improvement}
              </span>
            ) : null}
          </div>
          <strong className="mt-1 block font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-ink">{progress.bestScore?.toLocaleString() ?? "—"}</strong>
          <div className="mt-auto pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${scoreProgress}%` }} /></div>
            <div className="mt-1.5 flex justify-between text-[11px] font-medium text-navy/40"><span>400</span><span>1600</span></div>
          </div>
        </div>
        <StatCard label="Tests completed" value={progress.testsDone.toLocaleString()} />
        <StatCard label="Tests available" value={availableCount.toLocaleString()} />
      </section>

      {isAdmin ? (
        <div className="mb-6 rounded-2xl border border-navy/10 bg-white px-5 py-3.5 text-sm leading-6 text-navy/55">
          <strong className="font-semibold text-navy/75">Admin preview.</strong> Unpublished tests are visible for QA. Students only see published tests.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Choose your next test</h2>
        {resumableSlugs.size > 0 ? <p className="text-xs font-medium text-navy/45">{resumableSlugs.size} test{resumableSlugs.size === 1 ? "" : "s"} ready to resume</p> : null}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-10 text-center text-sm text-navy/50">No tests are available right now.</div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {tests.map((test, testIndex) => {
            const bestScore = progress.bestBySlug[test.slug] ?? null;
            const attempts = progress.countBySlug[test.slug] ?? 0;
            const constructionLocked = test.status !== "published" && !isAdmin;
            const planLocked = !isAdmin && !testIndexIsAccessible(test.slug, testIndex, access.entitlements.fullTestLimit);
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
        <UpgradePrompt currentPlan="free" requiredPlan="max" title="Max unlocks the full test library" description="Use the free test as a baseline, then compare it against 5 more adaptive scores with unlimited daily practice." features={["6 full-length tests", "Unlimited daily drills", "Challenge questions"]} className="mt-8" />
      ) : access.plan === "core" ? (
        <UpgradePrompt currentPlan="core" requiredPlan="max" title="Max adds the full test library" description="Max includes all 6 tests, the complete course library, and a planner that uses your score reports." features={["6 full-length tests", "All advanced courses", "Personal study planner"]} className="mt-8" />
      ) : null}

      <Link href={access.entitlements.dailyDrillLimit === null ? "/pricing" : "/ultimate/drills"} className="group mt-6 flex cursor-pointer items-center gap-4 rounded-2xl border border-navy/10 bg-white p-5 text-navy transition-colors hover:border-brand/35">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-ice text-brand-600"><TestsIcon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm font-bold">{access.entitlements.dailyDrillLimit === null ? "Unlock daily drills with Max" : "Not ready for a full test?"}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-navy/50">{access.entitlements.dailyDrillLimit === null ? "Build one SAT pattern at a time between full-test checkpoints." : "Practice one skill at a time and return when you have a full testing window."}</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-navy/55">{label}</h2>
      <strong className="mt-1 block font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-ink">{value}</strong>
    </div>
  );
}

