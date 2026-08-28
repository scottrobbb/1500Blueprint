// Single-module practice completion. The module runner POSTs here on its results
// screen; we recompute the raw score SERVER-SIDE from the answer map (so the
// client can't inflate it) and store the attempt for history. Idempotent on
// clientToken.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleByKey } from "@/lib/sat/modules";
import { isCorrect } from "@/lib/sat/scoring";
import { saveModuleAttempt } from "@/lib/sat/moduleAttempts";
import type { AnswerMap } from "@/lib/sat/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { readIdempotencyToken } from "@/lib/idempotency";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { sanitizeAnswerMap, sanitizePerQuestionTime } from "@/lib/sat/submission";

const MAX_COMPLETION_BYTES = 256 * 1024;

type Body = {
  testSlug?: string;
  moduleKey?: string;
  answers?: AnswerMap;
  perQuestionTime?: Record<string, number>;
  clientToken?: unknown;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    const value = await readJsonBody(req, MAX_COMPLETION_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as Body;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "too_large" : "bad_json" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const { testSlug, moduleKey } = body;
  if (
    typeof testSlug !== "string"
    || testSlug.length === 0
    || testSlug.length > 160
    || typeof moduleKey !== "string"
    || moduleKey.length === 0
    || moduleKey.length > 160
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const clientToken = readIdempotencyToken(body.clientToken);
  if (!clientToken) return NextResponse.json({ error: "invalid_completion_token" }, { status: 400 });
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin && !(await canAccessPracticeTest(session.email, testSlug))) {
    return NextResponse.json({ error: "plan_limit" }, { status: 402 });
  }
  const test = await loadTest(testSlug, { includeDraft: isAdmin });
  if (!test) return NextResponse.json({ error: "test_not_found" }, { status: 404 });
  const found = getModuleByKey(test, moduleKey);
  if (!found) return NextResponse.json({ error: "module_not_found" }, { status: 404 });

  const questionIds = new Set(found.module.questions.map((question) => question.id));
  const answers = sanitizeAnswerMap(body.answers, questionIds);
  const perQuestionTime = sanitizePerQuestionTime(body.perQuestionTime, questionIds);
  if (!answers || !perQuestionTime) return NextResponse.json({ error: "invalid_completion_data" }, { status: 400 });
  try {
    const rate = await consumeRateLimit("practice-module-completion", session.email, { limit: 60, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  const correct = found.module.questions.reduce(
    (n, q) => n + (isCorrect(q, answers[q.id]) ? 1 : 0),
    0,
  );
  const total = found.module.questions.length;

  try {
    const id = await saveModuleAttempt(session.email, {
      testSlug,
      moduleKey,
      label: found.meta.fullLabel,
      correct,
      total,
      answers,
      perQuestionTime,
      moduleSnapshot: { meta: found.meta, module: found.module },
      clientToken,
    });
    return NextResponse.json({ attemptId: id, correct, total });
  } catch (e) {
    reportServerError("practice_test.module_completion_save.failed", e, {
      provider: "supabase",
      route: "/api/practice-test/module/complete",
      method: "POST",
    });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
