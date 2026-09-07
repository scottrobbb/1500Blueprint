import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { ChevronRightIcon } from "@/components/shell/icons";
import { getSession } from "@/lib/auth/session";
import { getNavStats, listTestAttempts } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";
import { listModuleAttempts } from "@/lib/sat/moduleAttempts";
import { loadTest } from "@/lib/sat/loadTest";
import { listPracticeModules } from "@/lib/sat/modules";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { UltimateShell } from "@/components/ultimate/UltimateShell";

export const metadata = {
  title: "Your attempts · 1500 Blueprint",
};

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Next 16: route params are async.
export default async function AttemptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string; module?: string }>;
}) {
  const { slug } = await params;
  const { workspace, module: moduleKey } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session.email);
  const workspaceQuery = returnToUltimate ? "?workspace=ultimate" : "";
  const testsHref = returnToUltimate ? "/ultimate/tests" : "/practice-test";

  const [nav, attempts, moduleAttempts, tests, access] = await Promise.all([
    getNavStats(session.email),
    listTestAttempts(session.email, slug),
    listModuleAttempts(session.email, slug),
    listTests(),
    getStudentAccess(session.email),
  ]);

  // Arriving from a single module's card. The key is read back off the test
  // rather than trusted, so a hand-edited ?module= falls back to the whole
  // history instead of rendering a page about a module that does not exist.
  const test = moduleKey ? await loadTest(slug) : null;
  const focused = test
    ? listPracticeModules(test).find((m) => m.key === moduleKey) ?? null
    : null;
  const shown = focused
    ? moduleAttempts.filter((a) => a.moduleKey === focused.key)
    : moduleAttempts;
  const modulesHref = `/practice-test/${slug}/modules${workspaceQuery}`;

  const title = tests.find((t) => t.slug === slug)?.title ?? slug;
  const num = slug.match(/(\d+)\s*$/)?.[1] ?? "";
  const label = num ? `Practice Test ${num}` : title;

  const content = (
    <>
      <div className="mx-auto w-full max-w-[860px] px-4 pb-12 pt-7 sm:px-6">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/50">
          <Link href={testsHref} className="hover:text-navy">
            Practice Tests
          </Link>
          <span aria-hidden>/</span>
          {focused ? (
            <>
              <Link href={modulesHref} className="hover:text-navy">
                {label}
              </Link>
              <span aria-hidden>/</span>
              <span className="text-navy/70">{focused.label}</span>
            </>
          ) : (
            <span className="text-navy/70">{label}</span>
          )}
        </div>
        <h1 className="font-display text-2xl font-extrabold text-navy">
          {focused ? "Score history" : "Your attempts"}
        </h1>
        {focused ? null : (
          <p className="mt-1 text-sm text-navy/55">
            Every time you have finished {label}, newest first. Open one to see the full score report.
          </p>
        )}

        {focused ? null : attempts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-navy/15 bg-white p-8 text-center text-navy/60">
            You have not finished this test yet.{" "}
            <Link href={`/practice-test/${slug}${workspaceQuery}`} prefetch={false} className="font-semibold text-brand-600">
              Start it now
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {attempts.map((a, i) => (
              <li key={a.id}>
                <Link
                  href={`/practice-test/${slug}/results/${a.id}${workspaceQuery}`}
                  className="group flex items-center gap-4 rounded-xl border border-navy/15 bg-white p-4 transition-colors hover:border-navy/30"
                >
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-navy font-display text-base font-extrabold text-white">
                    {attempts.length - i}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg font-bold text-ink">
                      {a.totalScore ?? "-"}
                      <span className="ml-1 text-xs font-semibold text-navy/45">/ 1600</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-navy/55">
                      <span>R&amp;W {a.rwScore ?? "-"}</span>
                      <span aria-hidden>·</span>
                      <span>Math {a.mathScore ?? "-"}</span>
                      <span aria-hidden>·</span>
                      <span>{formatTaken(a.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 flex-none text-navy/40 group-hover:text-navy" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {focused || moduleAttempts.length > 0 ? (
          <section className={focused ? "mt-5" : "mt-9"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-navy">
                {focused ? focused.label : "Single-module practice"}
              </h2>
              <Link href={modulesHref} className="text-xs font-semibold text-navy/55 hover:text-navy">
                Practice a module
              </Link>
            </div>
            {focused ? null : (
              <p className="mt-1 text-sm text-navy/55">Modules you have drilled on their own, newest first.</p>
            )}
            {focused && shown.length === 0 ? (
              <div className="mt-4 rounded-xl border border-navy/15 bg-white p-8 text-center text-navy/60">
                You have not finished this module yet.{" "}
                <Link
                  href={`/practice-test/${slug}/module/${focused.key}${workspaceQuery}`}
                  prefetch={false}
                  className="font-semibold text-brand-600"
                >
                  Start it now
                </Link>
                .
              </div>
            ) : (
            <ul className="mt-4 space-y-2.5">
              {shown.map((a, i) => (
                <li key={a.id}>
                  <Link
                    href={`/practice-test/${slug}/module/${a.moduleKey}/results/${a.id}${workspaceQuery}`}
                    className="group flex items-center gap-4 rounded-xl border border-navy/15 bg-white p-4 transition-colors hover:border-navy/30"
                  >
                    <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-ice font-display text-sm font-extrabold tabular-nums text-brand-600">
                      {a.correct}/{a.total}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Filtered to one module, every row would repeat its
                          name; the ordinal is what makes it read as progress. */}
                      <div className="truncate font-display text-base font-bold text-ink">
                        {focused ? `Attempt ${shown.length - i}` : a.label}
                      </div>
                      <div className="mt-0.5 text-[12px] text-navy/55">{formatTaken(a.createdAt)}</div>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 flex-none text-navy/40 group-hover:text-navy" />
                  </Link>
                </li>
              ))}
            </ul>
            )}
          </section>
        ) : null}
      </div>
      <footer className="mx-auto w-full max-w-[860px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </>
  );

  if (returnToUltimate) {
    return (
      <UltimateShell stats={{ ...nav, plan: access.plan }} access={access}>
        {content}
      </UltimateShell>
    );
  }

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="tests" stats={nav} />
      <main>{content}</main>
    </div>
  );
}
