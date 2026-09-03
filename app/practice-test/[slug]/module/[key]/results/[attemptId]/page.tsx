import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleByKey } from "@/lib/sat/modules";
import { getModuleAttempt } from "@/lib/sat/moduleAttempts";
import { ModuleResults } from "@/components/test/ModuleResults";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { BluebookSurface } from "@/components/theme/BluebookSurface";

export const metadata = {
  title: "Module result · 1500 Blueprint",
};

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Read-only review of a saved module attempt (recomputes the per-question review
// from stored answers). getModuleAttempt filters by email, so a student can only
// open their own.
export default async function ModuleAttemptResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; key: string; attemptId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug, key, attemptId } = await params;
  const { workspace } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session.email);
  const workspaceQuery = returnToUltimate ? "?workspace=ultimate" : "";

  const attempt = await getModuleAttempt(session.email, attemptId);
  if (!attempt || attempt.testSlug !== slug || attempt.moduleKey !== key) notFound();

  // New attempts carry the compact immutable module that was administered.
  // Legacy attempts fall back to the current form; owner scoping above keeps
  // that compatibility read private even if the form was later unpublished.
  const found = attempt.moduleSnapshot;
  const legacyTest = found ? null : await loadTest(slug, { includeDraft: true });
  const resolved = found ?? (legacyTest ? getModuleByKey(legacyTest, key) : null);
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
        slug={slug}
        attemptDate={formatTaken(attempt.createdAt)}
        backHref={`/practice-test/${slug}/attempts${workspaceQuery}`}
        modulesHref={`/practice-test/${slug}/modules${workspaceQuery}`}
        testsHref={returnToUltimate ? "/ultimate/tests" : "/practice-test"}
      />
    </BluebookSurface>
  );
}
