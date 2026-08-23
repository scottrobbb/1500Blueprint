import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  deleteTestQuestion,
  TestPublicationError,
  updateTestQuestion,
  type ChoiceInput,
  type QuestionInput,
} from "@/lib/sat/admin-queries";
import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import type { QuestionType } from "@/lib/sat/admin-queries";

// Single practice-test question CMS endpoint. Every method authorizes with
// getAdminSession() before the service-role write. Next 16: ctx.params is a
// Promise.
type Ctx = { params: Promise<{ id: string }> };

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LETTERS: ChoiceId[] = ["A", "B", "C", "D"];

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// Coerce the untrusted body into a QuestionInput. The route id always wins over
// any id in the body so the write targets exactly one row.
function toQuestionInput(id: string, body: Record<string, unknown>): QuestionInput {
  const type: QuestionType = body.type === "grid" ? "grid" : "mc";
  const difficulty = (DIFFICULTIES as string[]).includes(String(body.difficulty))
    ? (body.difficulty as Difficulty)
    : "medium";

  const rawCorrect = String(body.correct ?? "");
  const correct = (LETTERS as string[]).includes(rawCorrect) ? (rawCorrect as ChoiceId) : null;

  const acceptedAnswers = Array.isArray(body.acceptedAnswers)
    ? body.acceptedAnswers.map((a) => String(a)).filter((a) => a.trim() !== "")
    : [];

  const choices: ChoiceInput[] = Array.isArray(body.choices)
    ? body.choices
        .map((c) => c as Record<string, unknown>)
        .filter((c) => (LETTERS as string[]).includes(String(c.letter)))
        .map((c) => ({
          letter: String(c.letter) as ChoiceId,
          text: typeof c.text === "string" ? c.text : "",
          explanation: str(c.explanation),
        }))
    : [];

  return {
    id,
    type,
    domain: str(body.domain),
    skill: str(body.skill),
    difficulty,
    passage: str(body.passage),
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    figureUrl: str(body.figureUrl),
    correct,
    acceptedAnswers,
    explanation: str(body.explanation),
    explanationSource: str(body.explanationSource),
    needsReview: Boolean(body.needsReview),
    choices,
  };
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    await updateTestQuestion(toQuestionInput(id, body));
  } catch (e) {
    console.error("update test question failed:", e);
    const invalid = e instanceof TestPublicationError;
    return NextResponse.json(
      { error: "save failed", detail: invalid ? e.message : "The question could not be saved. No successful save was confirmed." },
      { status: invalid ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { id } = await ctx.params;
  try {
    await deleteTestQuestion(id);
  } catch (e) {
    console.error("delete test question failed:", e);
    const invalid = e instanceof TestPublicationError;
    return NextResponse.json(
      { error: "delete failed", detail: invalid ? e.message : "The question could not be deleted. No deletion was confirmed." },
      { status: invalid ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
