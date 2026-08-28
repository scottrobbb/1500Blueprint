import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordVocabAnswer } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { hasRecordedDrillQuestionAttempt } from "@/lib/drills/progress";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("vocab-answer", session.email, { limit: 1_000, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Answer saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many answer requests", resetsAt: rate.resetsAt }, { status: 429 });
  const isAdmin = isAdminEmail(session.email);
  if (!(await canAccessDrillPublication("vocab", isAdmin))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const body = (await readJsonBody(request, 8 * 1024).catch(() => null)) as
    | {
        questionId?: unknown;
        selectedWord?: unknown;
        clientToken?: unknown;
        sessionToken?: unknown;
      }
    | null;
  if (
    typeof body?.questionId !== "string"
    || body.questionId.length === 0
    || body.questionId.length > 160
    || typeof body.selectedWord !== "string"
    || body.selectedWord.length === 0
    || body.selectedWord.length > 500
    || typeof body.clientToken !== "string"
    || body.clientToken.length === 0
    || body.clientToken.length > 200
    || typeof body.sessionToken !== "string"
    || body.sessionToken.length === 0
    || body.sessionToken.length > 200
  ) {
    return NextResponse.json(
      { error: "questionId, selectedWord, and session tokens are required." },
      { status: 400 },
    );
  }

  try {
    const duplicate = await hasRecordedDrillQuestionAttempt(session.email, body.clientToken);
    if (!duplicate && !isAdmin) {
      const allowance = await drillAllowance(session.email);
      if (!allowance.allowed) {
        return NextResponse.json({ error: "Drill access is not available.", code: "plan_limit", ...allowance }, { status: 402 });
      }
    }
    return NextResponse.json(
      await recordVocabAnswer(session.email, {
        questionId: body.questionId,
        selectedWord: body.selectedWord,
        clientToken: body.clientToken,
        sessionToken: body.sessionToken,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record answer.";
    const invalid = /not found|not an answer choice|no correct word/i.test(message);
    if (!invalid) {
      reportServerError("drill.vocab.answer_failed", error, {
        provider: "supabase",
        route: "/api/drills/vocab/answer",
        method: "POST",
      });
    }
    return NextResponse.json(
      { error: invalid ? message : "Could not record the vocab answer." },
      { status: invalid ? 400 : 500 },
    );
  }
}
