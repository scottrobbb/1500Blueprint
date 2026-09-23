import { notFound } from "next/navigation";
import { ModuleResults } from "@/components/test/ModuleResults";
import { BluebookSurface } from "@/components/theme/BluebookSurface";
import { studentEmailFromParam } from "@/lib/admin/student-lookup";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleAttempt } from "@/lib/sat/moduleAttempts";
import { getModuleByKey } from "@/lib/sat/modules";

export const metadata = { title: "Student module result" };

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The student's own single-module review, rendered read-only for an admin.
export default async function UltimateAdminStudentModuleAttemptPage({
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
  const attempt = await getModuleAttempt(email, attemptId);
  if (!attempt) notFound();

  // Newer attempts carry the module that was administered; older ones fall back
  // to the current form, matching the student's own review.
  const legacyTest = attempt.moduleSnapshot
    ? null
    : await loadTest(attempt.testSlug, { includeDraft: true });
  const resolved = attempt.moduleSnapshot
    ?? (legacyTest ? getModuleByKey(legacyTest, attempt.moduleKey) : null);
  if (!resolved) notFound();

  const timeUsed = Object.values(attempt.perQuestionTime).reduce((a, b) => a + b, 0);

  return (
    <BluebookSurface>
      <ModuleResults
        meta={resolved.meta}
        module={resolved.module}
        answers={attempt.answers}
        perQuestionTime={attempt.perQuestionTime}
        timeUsedSeconds={timeUsed}
        slug={attempt.testSlug}
        attemptDate={formatTaken(attempt.createdAt)}
        backHref={`/ultimate/admin/students/${encodeURIComponent(email)}`}
        backLabel="Back to student"
        readOnly
      />
    </BluebookSurface>
  );
}
