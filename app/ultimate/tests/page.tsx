import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, TestsIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { isPracticeTestUnderConstruction } from "@/lib/flags";
import { getTestProgress } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";

export const metadata = { title: "Full-Length Tests" };

export default async function UltimateTestsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [tests, progress] = await Promise.all([listTests(), getTestProgress(session.email)]);
  const isAdmin = isAdminEmail(session.email);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Bluebook-style digital SAT"
          title="Full-length tests"
          description="The existing adaptive modules, timing, scoring, and attempt history are connected directly. Test sessions open full-screen to preserve the exam experience."
        />
        {progress.testsDone > 0 && (
          <Link
            href="/ultimate/tests/completed"
            className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy hover:bg-navy/[0.03]"
          >
            Completed tests <ChevronRightIcon className="h-4 w-4" />
          </Link>
        )}
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <ScoreMetric label="Best score" value={progress.bestScore?.toLocaleString() ?? "—"} />
        <ScoreMetric label="Tests completed" value={progress.testsDone.toLocaleString()} />
        <ScoreMetric
          label="Improvement"
          value={progress.improvement == null ? "—" : `${progress.improvement >= 0 ? "+" : ""}${progress.improvement}`}
          accent={progress.improvement != null && progress.improvement > 0}
        />
      </section>

      <div className="mb-4 rounded-xl border border-gold/35 bg-gold/[0.08] px-4 py-3 text-[13px] font-semibold leading-5 text-navy/65">
        Tests still marked under construction remain unavailable to students. Scott&apos;s admin access continues to include every authored test for QA.
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-10 text-center text-sm text-navy/50">
          No tests are available right now.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tests.map((test) => {
            const number = test.slug.match(/(\d+)\s*$/)?.[1] ?? "•";
            const best = progress.bestBySlug[test.slug] ?? null;
            const attempts = progress.countBySlug[test.slug] ?? 0;
            const locked = isPracticeTestUnderConstruction(test.slug) && !isAdmin;

            return (
              <li key={test.slug}>
                <div className={`rounded-[16px] border bg-white p-5 shadow-pop ${locked ? "border-dashed border-navy/15 opacity-65" : "border-navy/10 border-t-2 border-t-brand"}`}>
                  <div className="flex items-start gap-4">
                    <span className={`grid h-12 w-12 flex-none place-items-center rounded-xl font-display text-xl font-extrabold text-white ${locked ? "bg-navy/40" : "bg-navy"}`}>
                      {number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-extrabold text-ink">{test.title}</h2>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-navy/50">
                        <span className="rounded-md bg-haze px-2 py-1">R&amp;W + Math</span>
                        <span className="rounded-md bg-haze px-2 py-1">4 modules</span>
                        {best != null && <span className="rounded-md bg-success-bg px-2 py-1 text-success-600">Best {best}</span>}
                        {locked && <span className="rounded-md bg-navy/10 px-2 py-1">Locked</span>}
                      </div>
                    </div>
                  </div>

                  {locked ? (
                    <div className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-navy/[0.05] text-sm font-bold text-navy/40">
                      Available after Scott publishes it
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={`/practice-test/${test.slug}?workspace=ultimate`}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white hover:bg-navy-700"
                      >
                        {attempts > 0 ? "Retake" : "Start test"} <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/practice-test/${test.slug}/modules?workspace=ultimate`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/15 px-4 text-sm font-bold text-navy hover:bg-haze"
                      >
                        Modules
                      </Link>
                    </div>
                  )}

                  {attempts > 0 && !locked && (
                    <Link href="/ultimate/tests/completed" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                      View {attempts} past {attempts === 1 ? "attempt" : "attempts"} <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/ultimate/drills" className="mt-5 flex items-center gap-3 rounded-[16px] border border-dashed border-brand/35 bg-ice/45 p-4 text-navy hover:bg-ice">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-brand-600">
          <TestsIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block font-display text-sm">Short on time?</strong>
          <span className="text-xs text-navy/50">Run a focused drill and keep the same XP and mastery history.</span>
        </span>
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ScoreMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[16px] border border-navy/10 bg-white p-5 shadow-pop">
      <strong className={`font-display text-3xl font-extrabold tracking-tight ${accent ? "text-success-600" : "text-navy"}`}>{value}</strong>
      <span className="mt-1 block text-xs font-medium text-navy/45">{label}</span>
    </div>
  );
}
