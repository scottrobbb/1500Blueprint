import { notFound } from "next/navigation";
import { CompletedTestsDashboard } from "@/components/test/CompletedTestsDashboard";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listAllTestAttempts } from "@/lib/gamification/state";
import { listTests } from "@/lib/sat/loadTest";

export const metadata = {
  title: "Completed Tests",
  description: "Review SAT practice-test scores and progress inside 1500 Ultimate.",
};

export default async function UltimateCompletedTestsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [attempts, tests] = await Promise.all([
    listAllTestAttempts(session.email),
    listTests(),
  ]);
  const testTitles = Object.fromEntries(tests.map((test) => [test.slug, test.title]));

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8 sm:px-7">
      <CompletedTestsDashboard attempts={attempts} testTitles={testTitles} variant="ultimate" />
    </div>
  );
}
