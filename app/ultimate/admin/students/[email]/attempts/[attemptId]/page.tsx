import { notFound } from "next/navigation";
import { ResultsScreen } from "@/components/test/ResultsScreen";
import { studentEmailFromParam } from "@/lib/admin/student-lookup";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getTestAttempt } from "@/lib/gamification/state";
import { loadTest } from "@/lib/sat/loadTest";
import { scoreTest } from "@/lib/sat/scoring";
import { BluebookSurface } from "@/components/theme/BluebookSurface";

export const metadata = { title: "Student report" };

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The student's own score report -- per-question review and topic breakdown --
// rendered for an admin. Read-only: scoreTest is pure and nothing is awarded.
export default async function UltimateAdminStudentAttemptPage({
  params,
}: {
  params: Promise<{ email: string; attemptId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();

  const { email: rawEmail, attemptId } = await params;
  const email = studentEmailFromParam(rawEmail);

  // Scoped to the student being viewed, so the id alone cannot reach another
  // student's attempt.
  const attempt = await getTestAttempt(email, attemptId);
  if (!attempt) notFound();

  // Newer attempts carry the exact completed form; older ones fall back to the
  // current published version, matching the student's own report.
  const test = attempt.testSnapshot ?? await loadTest(attempt.testSlug, { includeDraft: true });
  if (!test) notFound();

  const result = scoreTest(test, attempt.routed, attempt.answers);

  return (
    <BluebookSurface>
      <ResultsScreen
        test={test}
        result={result}
        routed={attempt.routed}
        answers={attempt.answers}
        perQuestionTime={attempt.perQuestionTime}
        backHref={`/ultimate/admin/students/${encodeURIComponent(email)}`}
        backLabel="Back to student"
        attemptDate={formatTaken(attempt.createdAt)}
      />
    </BluebookSurface>
  );
}
