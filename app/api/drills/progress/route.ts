// Records a question attempt for the objective drills (Targeted Math, Vocab),
// which grade on the client and otherwise send nothing to the server. The AI
// drills (Grammar, Reading) record progress inside /api/drills/grade instead.
// This drives the "don't re-feed mastered questions" pool and the History tab.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDrill, getQuestion } from "@/lib/drills/admin-queries";
import {
  hasRecordedDrillQuestionAttempt,
  recordObjectiveProgress,
} from "@/lib/drills/progress";
import type { LetteredChoice, VocabContent } from "@/lib/drills/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { isCorrect as isMathAnswerCorrect } from "@/components/drills/math/mockData";

const OBJECTIVE: ReadonlySet<string> = new Set(["targeted-math", "vocab"]);

type Body = {
  drillSlug?: string;
  questionId?: string;
  answer?: unknown;
  clientToken?: unknown;
  sessionToken?: unknown;
};

function canonicalCorrect(
  drillSlug: string,
  question: Awaited<ReturnType<typeof getQuestion>>,
  answer: string,
): boolean | null {
  if (!question) return null;
  if (drillSlug === "targeted-math") {
    const content = question.content as Partial<{
      accepted: string[];
      correct: LetteredChoice["id"];
    }>;
    if (question.answerType === "grid_in" && Array.isArray(content.accepted)) {
      return isMathAnswerCorrect(answer, content.accepted);
    }
    if (question.answerType === "mc_single" && typeof content.correct === "string") {
      return answer === content.correct;
    }
    return null;
  }
  if (drillSlug === "vocab") {
    const content = question.content as Partial<VocabContent>;
    return question.answerType === "mc_single"
      && Array.isArray(content.options)
      && Number.isInteger(content.correctIndex)
      ? answer === content.options[content.correctIndex as number]
      : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { drillSlug, questionId, answer, clientToken, sessionToken } = body;
  if (
    !drillSlug
    || !questionId
    || typeof answer !== "string"
    || !OBJECTIVE.has(drillSlug)
    || typeof clientToken !== "string"
    || clientToken.length === 0
    || clientToken.length > 200
    || typeof sessionToken !== "string"
    || sessionToken.length === 0
    || sessionToken.length > 200
  ) {
    return NextResponse.json(
      { error: "drillSlug, questionId, answer, and session tokens are required" },
      { status: 400 },
    );
  }
  try {
    if (await hasRecordedDrillQuestionAttempt(session.email, clientToken)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  } catch (error) {
    console.error("drill progress idempotency check failed", error);
    return NextResponse.json({ error: "Could not verify progress" }, { status: 500 });
  }
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin) {
    const allowance = await drillAllowance(session.email);
    if (!allowance.allowed) {
      return NextResponse.json({ error: "Drill access is not available.", code: "plan_limit", ...allowance }, { status: 402 });
    }
  }
  // Confirm the question exists, belongs to this drill, and is published — same
  // guard as the grade route, so a client can't record progress on a draft/foreign id.
  const [question, drill] = await Promise.all([getQuestion(questionId), getDrill(drillSlug)]);
  if (!question || !drill || question.drillSlug !== drillSlug || question.status !== "published") {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (drill.status !== "published" && !isAdmin) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  const correct = canonicalCorrect(drillSlug, question, answer);
  if (correct === null) {
    return NextResponse.json({ error: "Question cannot be graded" }, { status: 422 });
  }

  try {
    await recordObjectiveProgress(session.email, {
      drillSlug: drillSlug as "targeted-math" | "vocab",
      questionId,
      correct,
      clientToken,
      sessionToken,
    });
  } catch (e) {
    console.error("recordProgress failed:", e);
    return NextResponse.json({ error: "Could not record progress" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
