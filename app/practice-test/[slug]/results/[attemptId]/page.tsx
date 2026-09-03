import { notFound, redirect } from "next/navigation";
import { ResultsScreen } from "@/components/test/ResultsScreen";
import { loadTest } from "@/lib/sat/loadTest";
import { scoreTest } from "@/lib/sat/scoring";
import { getSession } from "@/lib/auth/session";
import { getTestAttempt } from "@/lib/gamification/state";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { isAdminEmail } from "@/lib/auth/admin";
import { BluebookSurface } from "@/components/theme/BluebookSurface";

export const metadata = {
  title: "Your results · 1500 Blueprint",
};

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Next 16: route params are async. Read-only review of a saved attempt; it
// recomputes the report from stored data and never awards anything.
export default async function AttemptResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug, attemptId } = await params;
  const { workspace } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session.email);

  // getTestAttempt filters by email, so a student can only open their own attempts.
  const [attempt, profile, plannerAccess] = await Promise.all([
    getTestAttempt(session.email, attemptId),
    getStudyPlannerProfile(session.email).catch(() => null),
    getStudentAccess(session.email).catch(() => null),
  ]);
  if (!attempt || attempt.testSlug !== slug) notFound();

  // New attempts carry the exact completed form. Legacy attempts fall back to
  // the current published form until they have a stored snapshot.
  const test = attempt.testSnapshot ?? await loadTest(slug, {
    includeDraft: isAdminEmail(session.email),
  });
  if (!test) notFound();

  // scoreTest is pure, so the immutable form + answers + routed variants always
  // reproduce the report the student originally completed.
  const result = scoreTest(test, attempt.routed, attempt.answers);

  return (
    <BluebookSurface>
      <ResultsScreen
        test={test}
        result={result}
        routed={attempt.routed}
        answers={attempt.answers}
        perQuestionTime={attempt.perQuestionTime}
        backHref={`/practice-test/${slug}/attempts${returnToUltimate ? "?workspace=ultimate" : ""}`}
        completedHref={returnToUltimate ? "/ultimate/tests/completed" : undefined}
        testsHref={returnToUltimate ? "/ultimate/tests" : undefined}
        attemptDate={formatTaken(attempt.createdAt)}
        scorePromptAttemptId={attemptId}
        shouldPromptForScore={Boolean(
          plannerAccess?.active
          && plannerAccess.entitlements.studyPlanner
          && profile
          && profile.lastScorePromptAttemptId !== attemptId
          && Date.parse(attempt.createdAt) > Date.parse(profile.scoreUpdatedAt ?? profile.updatedAt)
        )}
      />
    </BluebookSurface>
  );
}
