import { NextResponse } from "next/server";
import { getExplanationEditorSession } from "@/lib/auth/staff";
import { updateExplanation, type ExplanationTargetType } from "@/lib/explanations/queries";

type Context = { params: Promise<{ targetType: string; id: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await getExplanationEditorSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { targetType, id } = await context.params;
  const normalizedType: ExplanationTargetType | null = targetType === "question-bank"
    ? "question_bank"
    : targetType === "practice-test"
      ? "practice_test"
      : null;
  if (!normalizedType || !id || id.length > 160) {
    return NextResponse.json({ error: "Invalid explanation target" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { explanation?: unknown } | null;
  const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
  if (!explanation || explanation.length > 20_000) {
    return NextResponse.json({ error: "Write an explanation between 1 and 20,000 characters." }, { status: 400 });
  }

  try {
    await updateExplanation(session.email, normalizedType, id, explanation);
    return NextResponse.json({ explanation });
  } catch (error) {
    console.error("explanation editor update failed", error);
    return NextResponse.json({ error: "The explanation could not be saved." }, { status: 500 });
  }
}
