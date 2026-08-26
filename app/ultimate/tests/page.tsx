import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getTestProgress } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";
import { getStudentAccess } from "@/lib/auth/entitlements";

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
            <h1 className="max-w-xl font-display text-[34px] font-extrabold leading-[1.03] tracking-[-0.04em] sm:text-[44px]">
              Practice the real test, not just the questions.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/62 sm:text-[15px]">
              Full adaptive modules, official timing, a built-in break, and detailed score reports in a focused exam workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {launchTest ? (
                <Link
                  href={`/practice-test/${launchTest.slug}?workspace=ultimate`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-colors hover:bg-[#4db2f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Start a full test <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : null}
              {progress.testsDone > 0 ? (
                <Link
                  href="/ultimate/tests/completed"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-5 text-sm font-bold text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  View score history <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Your best score</p>
                <strong className="mt-1 block font-display text-5xl font-extrabold tracking-[-0.05em]">
                  {progress.bestScore?.toLocaleString() ?? "—"}
                </strong>
              </div>
              {progress.improvement != null ? (
                <span className={`mb-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${progress.improvement > 0 ? "bg-[#d9fae8] text-[#147a40]" : "bg-white/10 text-white/65"}`}>
                  {progress.improvement >= 0 ? "+" : ""}{progress.improvement} points
                </span>
              ) : null}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-sky" style={{ width: `${scoreProgress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-white/35"><span>400</span><span>1600</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
              <HeroMetric value={progress.testsDone.toLocaleString()} label="tests completed" />
              <HeroMetric value={availableCount.toLocaleString()} label="tests available" />
            </div>
          </div>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">Test library</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Choose your next test</h2>
          <p className="mt-1 text-sm text-navy/50">Set aside about 2 hours and 14 minutes for the full experience.</p>
        </div>
        {progress.testsDone > 0 ? (
          <Link href="/ultimate/tests/completed" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-navy/10 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand/35 hover:text-brand-600">
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

            return (
              <li key={test.slug}>
                <article className={`group relative h-full overflow-hidden rounded-[18px] border bg-white transition-[transform,border-color,box-shadow] duration-200 motion-reduce:transform-none motion-reduce:transition-none ${locked ? "border-dashed border-navy/15 opacity-65" : "border-navy/10 hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_14px_36px_-24px_rgba(11,42,91,0.55)]"}`}>
                  <div className={`h-1 w-full ${best != null ? "bg-success" : locked ? "bg-navy/15" : "bg-brand"}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                    <span className={`grid h-12 w-12 flex-none place-items-center rounded-[14px] font-display text-xl font-extrabold ${locked ? "bg-haze text-navy/35" : "bg-ice text-brand-600"}`}>
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
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 divide-x divide-navy/10 rounded-xl bg-haze/70 py-3 text-center">
                    <TestDetail value="2h 14m" label="Duration" />
                    <TestDetail value="4" label="Modules" />
                    <TestDetail value={attempts.toString()} label={attempts === 1 ? "Attempt" : "Attempts"} />
                  </div>

                  {locked ? (
                    <div className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-navy/[0.05] px-4 text-center text-sm font-bold text-navy/40">
                      {planLocked ? `Upgrade to unlock test ${testIndex + 1}` : "Coming soon"}
                    </div>
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

      <Link href="/ultimate/drills" className="group mt-6 flex items-center gap-4 rounded-[18px] border border-brand/20 bg-ice/50 p-4 text-navy transition-colors hover:border-brand/40 hover:bg-ice sm:p-5">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
          <TestsIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm">Not ready for a full test?</strong>
          <span className="mt-0.5 block text-xs leading-5 text-navy/50">Practice one skill at a time and come back when you have a full testing window.</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong className="block font-display text-xl font-extrabold text-white">{value}</strong>
      <span className="mt-0.5 block text-[10px] font-medium text-white/40">{label}</span>
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
