import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  getCorrectAnswerLabel,
  getMathQuestionForGrading,
  gradeMathResponse,
} from "@/lib/question-bank/math-queries";
import { recordQuestionBankAttempt, type QuestionBankAttemptWrite } from "@/lib/question-bank/attempts";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessQuestionBankLevel } from "@/lib/question-bank/math";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

type AttemptBody = {
  questionId: string;
  response: string;
  durationMs: number;
  sessionId: string | null;
  clientToken: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rate = await checkRateLimit("question-bank-attempt", session.email, { limit: 1_000, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Answer saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many answer requests", resetsAt: rate.resetsAt }, { status: 429 });

  const input = parseAttemptBody(await readJsonBody(request, 8 * 1024).catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }

  const isAdmin = isAdminEmail(session.email);
  const access = isAdmin ? null : await getStudentAccess(session.email);
  if (access && !access.active) {
    return NextResponse.json({ error: "Question Bank access is not active.", code: "plan_limit" }, { status: 402 });
  }
  const bankLimit = access?.entitlements.questionBankLimit ?? "unlimited";

  const existing = await loadAttemptByToken(session.email, input.clientToken);
  if (existing.error) {
    reportServerError("question_bank.math.retry_check_failed", existing.error, {
      provider: "supabase",
      route: "/api/question-bank/math/attempt",
      method: "POST",
    });
    return NextResponse.json({ error: "We could not check that answer." }, { status: 500 });
  }
  if (existing.data) {
    if (!matchesAttempt(existing.data, input)) {
      return NextResponse.json({ error: "That answer token was already used." }, { status: 409 });
    }
    const question = await getMathQuestionForGrading(input.questionId);
    if (question && access && !canAccessQuestionBankLevel(question.question.level, access.entitlements.challengeQuestions)) {
      return challengeUpgrade();
    }
    return NextResponse.json({
      correct: existing.data.correct,
      explanation: question?.explanation ?? "Your answer was already saved.",
      correctAnswer: question ? getCorrectAnswerLabel(question) : "",
    });
  }

  const gradingQuestion = await getMathQuestionForGrading(input.questionId);
  if (!gradingQuestion) {
    return NextResponse.json({ error: "Question is not available" }, { status: 404 });
  }
  if (access && !canAccessQuestionBankLevel(gradingQuestion.question.level, access.entitlements.challengeQuestions)) {
    return challengeUpgrade();
  }

  const correct = gradeMathResponse(gradingQuestion, input.response);
  let write: QuestionBankAttemptWrite;
  try {
    write = await recordQuestionBankAttempt({
      email: session.email,
      questionId: input.questionId,
      sessionId: input.sessionId,
      clientToken: input.clientToken,
      response: input.response,
      correct,
      durationMs: input.durationMs,
      section: "math",
      domain: gradingQuestion.question.domain,
      skill: gradingQuestion.question.skill ?? null,
      difficulty: gradingQuestion.question.difficulty,
      limit: bankLimit === "unlimited" ? null : bankLimit,
    });
  } catch (error) {
    reportServerError("question_bank.math.attempt_write_failed", error, {
      provider: "supabase",
      route: "/api/question-bank/math/attempt",
      method: "POST",
    });
    return NextResponse.json({ error: "Your answer was graded, but its analytics could not be saved." }, { status: 500 });
  }
  if (!write.allowed) {
    return NextResponse.json({ error: `You have used all ${bankLimit} questions included with your plan.`, code: "plan_limit", used: write.used, limit: bankLimit }, { status: 402 });
  }
  if (write.questionId !== input.questionId || write.response !== input.response) {
    return NextResponse.json({ error: "That answer token was already used." }, { status: 409 });
  }

  return NextResponse.json({
    correct: write.correct ?? correct,
    explanation: gradingQuestion.explanation,
    correctAnswer: getCorrectAnswerLabel(gradingQuestion),
  });
}

function parseAttemptBody(value: unknown): AttemptBody | null {
  if (!isRecord(value)) return null;
  if (typeof value.questionId !== "string" || value.questionId.length > 160) return null;
  if (typeof value.response !== "string" || value.response.length > 500) return null;
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)) return null;
  const clientToken = readRequiredToken(value.clientToken);
  if (!clientToken) return null;

  return {
    questionId: value.questionId,
    response: value.response,
    durationMs: Math.max(0, Math.min(Math.round(value.durationMs), 86_400_000)),
    sessionId: readOptionalToken(value.sessionId),
    clientToken,
  };
}

function readOptionalToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 160 ? value : null;
}

function readRequiredToken(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type StoredAttempt = {
  question_id: string;
  response: { value?: unknown } | null;
  correct: boolean;
};

function loadAttemptByToken(email: string, clientToken: string) {
  return supabaseAdmin()
    .from("question_bank_attempts")
    .select("question_id,response,correct")
    .eq("email", email)
    .eq("client_token", clientToken)
    .maybeSingle<StoredAttempt>();
}

function matchesAttempt(stored: StoredAttempt, input: AttemptBody): boolean {
  return stored.question_id === input.questionId && stored.response?.value === input.response;
}

function challengeUpgrade() {
  return NextResponse.json({ error: "Challenge questions are included with Core and Max.", code: "plan_limit" }, { status: 402 });
}
