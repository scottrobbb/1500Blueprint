import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { CompletedTestsDashboard } from "@/components/test/CompletedTestsDashboard";
import { ModuleAttemptHistory } from "@/components/test/ModuleAttemptHistory";
import { getSession } from "@/lib/auth/session";
import { getNavStats, listAllTestAttempts } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";
import { listAllModuleAttempts } from "@/lib/sat/moduleAttempts";

export const metadata = {
  title: "Completed Tests · 1500 Blueprint",
  description: "Review your complete SAT practice test history, score trends, and detailed reports.",
};

export default async function CompletedTestsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [nav, attempts, moduleAttempts, tests] = await Promise.all([
    getNavStats(session.email),
    listAllTestAttempts(session.email),
    listAllModuleAttempts(session.email),
    listTests(),
  ]);
  const testTitles = Object.fromEntries(tests.map((test) => [test.slug, test.title]));

  return (
    <div className="min-h-dvh bg-shell-50 text-ink">
      <AppNav activePage="tests" stats={nav} />
      <CompletedTestsDashboard attempts={attempts} testTitles={testTitles} />
      <ModuleAttemptHistory
        attempts={moduleAttempts}
        testTitles={testTitles}
        className="mx-auto w-full max-w-[1100px] px-5 pb-10 sm:px-6"
      />
      <footer className="mx-auto w-full max-w-[1100px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </div>
  );
}
