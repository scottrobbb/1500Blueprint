import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { ChevronRightIcon } from "@/components/shell/icons";
import { loadTest } from "@/lib/sat/loadTest";
import { listPracticeModules, type PracticeModuleMeta } from "@/lib/sat/modules";
import { bestByModuleKey } from "@/lib/sat/moduleAttempts";
import { getSession } from "@/lib/auth/session";
import { getNavStats } from "@/lib/gamification/state";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { isAdminEmail } from "@/lib/auth/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { UltimateShell } from "@/components/ultimate/UltimateShell";

export const metadata = {
  title: "Practice a module · 1500 Blueprint",
  description: "Drill a single SAT module on its own, timed and with full review.",
};

function tone(meta: PracticeModuleMeta): { chip: string; badge: string } {
  if (meta.order === 1) return { chip: "bg-navy/[0.06] text-navy/65", badge: "bg-navy text-white" };
  if (meta.variant === "hard") return { chip: "bg-gold/15 text-gold-600", badge: "bg-gold text-navy" };
  return { chip: "bg-brand/10 text-brand-600", badge: "bg-brand text-white" };
}

export default async function ModulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { slug } = await params;
  const { workspace } = await searchParams;
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session.email);
  const workspaceQuery = returnToUltimate ? "?workspace=ultimate" : "";
  const testsHref = returnToUltimate ? "/ultimate/tests" : "/practice-test";
  if (!(await canAccessPracticeTest(session.email, slug))) {
    redirect(returnToUltimate ? "/ultimate/tests?upgrade=1" : "/practice-test");
  }
  const [test, nav, best, access] = await Promise.all([
    loadTest(slug, { includeDraft: isAdminEmail(session.email) }),
    getNavStats(session.email),
    bestByModuleKey(session.email, slug),
    getStudentAccess(session.email),
  ]);
  if (!test) notFound();

  const modules = listPracticeModules(test);
  const groups = test.sections.map((s) => ({
    section: s,
    mods: modules.filter((m) => m.sectionId === s.id),
  }));

  const content = (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 sm:px-6">
        <Link
          href={testsHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-navy/55 hover:text-navy"
        >
          <ChevronRightIcon className="h-3.5 w-3.5 rotate-180" />
          Practice tests
        </Link>

        <h1 className="mt-3 font-display text-[26px] font-extrabold tracking-tight text-navy sm:text-3xl">
          Practice a single module
        </h1>
        <p className="mt-1.5 max-w-[560px] text-sm leading-relaxed text-navy/60">
          From {test.title}. Pick one module to drill on its own. It is fully timed, with the same
          Bluebook tools and a full answer review at the end. No adaptive routing.
        </p>

        {groups.map(({ section, mods }) => (
          <section key={section.id} className="mt-8">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-navy/55">
                {section.name}
              </h2>
              <span className="h-px flex-1 bg-navy/12" />
            </div>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {mods.map((m) => {
                const t = tone(m);
                return (
                  <li key={m.key}>
                    <Link
                      href={`/practice-test/${slug}/module/${m.key}${workspaceQuery}`}
                      className="group flex h-full flex-col rounded-xl border border-navy/15 bg-white p-4 transition-colors hover:border-navy/30"
                    >
                      <span
                        className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${t.chip}`}
                      >
                        {m.order === 1 ? "Module 1" : m.variant === "hard" ? "Hard" : "Easy"}
                      </span>
                      <span className="mt-3 font-display text-base font-bold text-ink">{m.label}</span>
                      <span className="mt-1 text-[13px] text-navy/55">
                        {m.questionCount} questions · {m.minutes} min
                      </span>
                      {best[m.key] ? (
                        <span className="mt-2 inline-flex w-fit items-center rounded-md bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success-600">
                          Best {best[m.key].correct}/{best[m.key].total}
                        </span>
                      ) : null}
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-bold text-brand-600">
                        Start
                        <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <Link
          href={`/practice-test/${slug}${workspaceQuery}`}
          className="mt-8 flex items-center gap-3 rounded-xl border border-navy/15 bg-white p-4 transition-colors hover:border-navy/30"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-ink">
              Want the real thing?
            </span>
            <span className="mt-0.5 block text-[13px] text-navy/60">
              Take the full adaptive test: both sections, four modules, and a scaled 400–1600 score.
            </span>
          </span>
          <span className="hidden font-display text-sm font-bold text-brand-600 sm:inline">
            Full test →
          </span>
        </Link>
    </div>
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
