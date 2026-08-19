import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  getCorrectAnswerLabel,
  getMathQuestionForGrading,
  gradeMathResponse,
} from "@/lib/question-bank/math-queries";
import { recordProgress } from "@/lib/drills/progress";
import { supabaseAdmin } from "@/utils/supabase/admin";

type AttemptBody = {
  questionId: string;
  response: string;
  durationMs: number;
  sessionId: string | null;
  clientToken: string | null;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const input = parseAttemptBody(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }

  const gradingQuestion = await getMathQuestionForGrading(input.questionId);
  if (!gradingQuestion) {
    return NextResponse.json({ error: "Question is not available" }, { status: 404 });
  }

  const correct = gradeMathResponse(gradingQuestion, input.response);
  await recordProgress(session.email, {
    drillSlug: "targeted-math",
    questionId: input.questionId,
    correct,
  });

  const { error } = await supabaseAdmin().from("question_bank_attempts").insert({
    email: session.email,
    question_id: input.questionId,
    session_id: input.sessionId,
    client_token: input.clientToken,
    mode: "practice",
    response: { value: input.response },
    correct,
    duration_ms: input.durationMs,
    section: "math",
    domain: gradingQuestion.question.domain,
    skill: gradingQuestion.question.skill,
    difficulty: gradingQuestion.question.difficulty,
  });

  // The drill progress ledger already captured the attempt. Missing-table is
  // expected in environments waiting for the Question Bank migration; a
  // duplicate client token means a retried request was already persisted.
  if (error && !isToleratedAttemptWriteError(error.code)) {
    console.error("Question Bank attempt write failed", error);
    return NextResponse.json({ error: "Your answer was graded, but its analytics could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    correct,
    explanation: gradingQuestion.explanation,
    correctAnswer: getCorrectAnswerLabel(gradingQuestion),
  });
}

function parseAttemptBody(value: unknown): AttemptBody | null {
  if (!isRecord(value)) return null;
  if (typeof value.questionId !== "string" || value.questionId.length > 160) return null;
  if (typeof value.response !== "string" || value.response.length > 500) return null;
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)) return null;

  return {
    questionId: value.questionId,
    response: value.response,
    durationMs: Math.max(0, Math.min(Math.round(value.durationMs), 86_400_000)),
    sessionId: readOptionalToken(value.sessionId),
    clientToken: readOptionalToken(value.clientToken),
  };
}

function readOptionalToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 160 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToleratedAttemptWriteError(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "23505";
}
