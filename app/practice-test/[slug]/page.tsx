import { notFound } from "next/navigation";
import { TestRunner } from "@/components/test/TestRunner";
import { loadTest } from "@/lib/sat/loadTest";
import { loadTestSession } from "@/lib/sat/testSession";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { getNavStats } from "@/lib/gamification/state";
import { isAdminEmail } from "@/lib/auth/admin";

export const metadata = {
  title: "Practice Test · 1500 SAT Blueprint",
};

// Next 16: route params are async.
export default async function RunTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await searchParams;
  const session = await getSession();
  if (!session || !(await canAccessPracticeTest(session.email, slug))) notFound();
  const test = await loadTest(slug, { includeDraft: isAdminEmail(session.email) });
  if (!test) notFound();
  const devMode = process.env.NODE_ENV !== "production" && session?.plan === "dev";
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session?.email);
  // An in-progress session lets the intro offer "Resume where you left off".
  const [resumeState, nav] = await Promise.all([
    loadTestSession(session.email, slug),
    getNavStats(session.email),
  ]);
  return (
    <TestRunner
      test={test}
      slug={slug}
      studentName={nav.name}
      devMode={devMode}
      resumeState={resumeState}
      returnToUltimate={returnToUltimate}
    />
  );
}
