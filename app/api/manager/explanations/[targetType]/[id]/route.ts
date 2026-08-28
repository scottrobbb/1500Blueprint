import { NextResponse } from "next/server";
import { getExplanationEditorSession } from "@/lib/auth/staff";
import { updateExplanation, type ExplanationTargetType } from "@/lib/explanations/queries";
import { staffExplanationIssue } from "@/lib/explanations/policy";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

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

  const body = (await readJsonBody(request, 32 * 1024).catch(() => null)) as { explanation?: unknown } | null;
  const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
  const issue = staffExplanationIssue(explanation);
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  try {
    await updateExplanation(session.email, normalizedType, id, explanation);
    return NextResponse.json({ explanation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/already has an explanation/i.test(message)) {
      return NextResponse.json({ error: "Another editor already completed this question. Refresh the queue." }, { status: 409 });
    }
    if (/not eligible for staff explanation/i.test(message)) {
      return NextResponse.json({ error: "This question is not available to explanation editors." }, { status: 403 });
    }
    reportServerError("manager.explanation.update_failed", error, {
      provider: "supabase",
      route: "/api/manager/explanations/[targetType]/[id]",
      method: "PATCH",
    });
    return NextResponse.json({ error: "The explanation could not be saved." }, { status: 500 });
  }
}
