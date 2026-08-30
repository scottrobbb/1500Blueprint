// Completed practice-test persistence. The runner POSTs here when it enters the
// results phase; we recompute the score SERVER-SIDE from the answer map + routed
// variants (scoreTest is pure, so the client can't inflate it), store the full
// attempt, award XP exactly once, and clear any in-progress session so the
// finished test never offers resume.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadTest } from "@/lib/sat/loadTest";
import { scoreTest } from "@/lib/sat/scoring";
import { awardTest, getNavStats } from "@/lib/gamification/state";
import { clearTestSession } from "@/lib/sat/testSession";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { AnswerMap, ModuleVariant, SectionId } from "@/lib/sat/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { readIdempotencyToken } from "@/lib/idempotency";
import { reportServerError, reportServerEvent } from "@/lib/observability/server";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { sanitizeAnswerMap, sanitizePerQuestionTime, sanitizeRouted } from "@/lib/sat/submission";

const MAX_COMPLETION_BYTES = 512 * 1024;

type CompleteBody = {
  testSlug?: string;
  answers?: AnswerMap;
  routed?: Partial<Record<SectionId, ModuleVariant>>;
  perQuestionTime?: Record<string, number>;
  clientToken?: unknown;
};

export async function POST(req: NextRequest) {
  const requestId = readIdempotencyToken(req.headers.get("x-client-request-id")) ?? crypto.randomUUID();
  const session = await getSession();
  if (!session) return completionError(requestId, 401, "unauthorized", "Unauthorized");

  let body: CompleteBody;
  try {
    const value = await readJsonBody(req, MAX_COMPLETION_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as CompleteBody;
  } catch (error) {
    return completionError(
      requestId,
      error instanceof RequestBodyTooLargeError ? 413 : 400,
      error instanceof RequestBodyTooLargeError ? "body_too_large" : "invalid_json",
      error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid JSON body",
    );
  }

  const { testSlug } = body;
  if (typeof testSlug !== "string" || testSlug.length === 0 || testSlug.length > 160) {
    return completionError(requestId, 400, "invalid_test_slug", "testSlug is required");
  }
  const clientToken = readIdempotencyToken(body.clientToken);
  if (!clientToken) {
    return completionError(requestId, 400, "invalid_completion_token", "A valid completion token is required", testSlug);
  }
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin && !(await canAccessPracticeTest(session.email, testSlug))) {
    return completionError(requestId, 402, "plan_limit", "This practice test is not included with your plan.", testSlug);
  }
  const test = await loadTest(testSlug, { includeDraft: isAdmin });
  if (!test) return completionError(requestId, 404, "test_not_found", "Test not found", testSlug);

  const questionIds = new Set(test.sections.flatMap((section) => [
    ...section.module1.questions,
    ...section.module2.easy.questions,
    ...section.module2.hard.questions,
  ]).map((question) => question.id));
  const answers = sanitizeAnswerMap(body.answers, questionIds);
  const routed = sanitizeRouted(body.routed);
  const perQuestionTime = sanitizePerQuestionTime(body.perQuestionTime, questionIds);
  if (!answers || !routed || !perQuestionTime) {
    return completionError(requestId, 400, "invalid_completion_data", "Invalid test completion data", testSlug);
  }
  try {
    const rate = await consumeRateLimit("practice-test-completion", session.email, { limit: 30, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return completionError(requestId, 429, "rate_limited", "Too many completion requests", testSlug, { resetsAt: rate.resetsAt });
    }
  } catch {
    return completionError(requestId, 503, "rate_limit_unavailable", "Test saving is temporarily unavailable", testSlug);
  }

  const result = scoreTest(test, routed, answers);
  const rwScore = result.sections.find((s) => s.sectionId === "rw")?.scaled;
  const mathScore = result.sections.find((s) => s.sectionId === "math")?.scaled;

  let attemptId = "";
  let xpAwarded = 0;
  try {
    const award = await awardTest(session.email, {
      testSlug,
      totalScore: result.total,
      rwScore,
      mathScore,
      answers,
      routed,
      perQuestionTime,
      testSnapshot: test,
      clientToken,
    });
    attemptId = award.attemptId;
    xpAwarded = award.xpAwarded;
  } catch (e) {
    reportServerError("practice_test.completion_save.failed", e, {
      provider: "supabase",
      route: "/api/tests/complete",
      method: "POST",
      source: testSlug,
      correlationId: requestId,
    });
    return NextResponse.json(
      { error: "Could not save your attempt", code: "persistence_failed", requestId },
      { status: 500 },
    );
  }

  // Best-effort: a finished test should not offer resume.
  try {
    await clearTestSession(session.email, testSlug);
  } catch (e) {
    reportServerError("practice_test.session_cleanup.failed", e, {
      provider: "supabase",
      route: "/api/tests/complete",
      method: "POST",
      source: testSlug,
      correlationId: requestId,
    });
  }

  let nav: { streak: number; level: number; xp: number } | undefined;
  try {
    const n = await getNavStats(session.email);
    nav = { streak: n.streak, level: n.level, xp: n.xp };
  } catch {
    nav = undefined;
  }

  // The planner migration may be deployed separately from this route, so a
  // missing profile/table must never block a completed test from being saved.
  reportServerEvent("practice_test.completion.saved", {
    provider: "next",
    route: "/api/tests/complete",
    method: "POST",
    source: testSlug,
    correlationId: requestId,
  });
  return NextResponse.json({
    attemptId,
    xpAwarded,
    total: result.total,
    requestId,
    hasStudyPlanner: await hasStudyPlanner(session.email),
    ...(nav ?? {}),
  });
}

function completionError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  source?: string,
  extra: Record<string, unknown> = {},
) {
  reportServerError("practice_test.completion.rejected", {
    name: "PracticeTestCompletionRejected",
    code,
    status,
    requestId,
  }, {
    provider: "next",
    route: "/api/tests/complete",
    method: "POST",
    source,
    correlationId: requestId,
  });
  return NextResponse.json({ error: message, code, requestId, ...extra }, { status });
}

async function hasStudyPlanner(email: string): Promise<boolean> {
  const [{ data: plannerProfile }, plannerAccess] = await Promise.all([
    supabaseAdmin()
      .from("study_planner_profiles")
      .select("email")
      .eq("email", email)
      .maybeSingle<{ email: string }>(),
    getStudentAccess(email).catch(() => null),
  ]);
  return Boolean(
    plannerProfile
    && plannerAccess?.active
    && plannerAccess.entitlements.studyPlanner,
  );
}
