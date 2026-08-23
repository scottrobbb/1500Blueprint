import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordVocabAnswer } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { hasRecordedDrillQuestionAttempt } from "@/lib/drills/progress";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isAdmin = isAdminEmail(session.email);
  if (!(await canAccessDrillPublication("vocab", isAdmin))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as
    | {
        questionId?: unknown;
        selectedWord?: unknown;
        clientToken?: unknown;
        sessionToken?: unknown;
      }
    | null;
  if (
    typeof body?.questionId !== "string"
    || typeof body.selectedWord !== "string"
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
    if (!invalid) console.error("Vocab answer failed", error);
    return NextResponse.json(
      { error: invalid ? message : "Could not record the vocab answer." },
      { status: invalid ? 400 : 500 },
    );
  }
}
