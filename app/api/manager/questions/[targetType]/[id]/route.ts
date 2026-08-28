import { NextResponse } from "next/server";
import { getExplanationEditorSession } from "@/lib/auth/staff";
import { updateQuestionContent, type ExplanationTargetType, type QuestionContentEdit } from "@/lib/explanations/queries";
import {
  staffQuestionChoiceIssue,
  staffQuestionPassageIssue,
  staffQuestionPromptIssue,
} from "@/lib/explanations/policy";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

type Context = { params: Promise<{ targetType: string; id: string }> };

// Lets an explanation editor fix wording (prompt/passage/choice text) on the
// question itself. Never touches the correct answer, difficulty, skill,
// status, or choice structure — see update_staff_question_content().
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
    return NextResponse.json({ error: "Invalid question target" }, { status: 400 });
  }

  const body = (await readJsonBody(request, 128 * 1024).catch(() => null)) as {
    prompt?: unknown;
    passage?: unknown;
    choices?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const edit: QuestionContentEdit = {};

  if (body.prompt !== undefined) {
    if (typeof body.prompt !== "string") return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
    const issue = staffQuestionPromptIssue(body.prompt);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    edit.prompt = body.prompt;
  }

  if (body.passage !== undefined) {
    if (typeof body.passage !== "string") return NextResponse.json({ error: "Invalid passage" }, { status: 400 });
    const issue = staffQuestionPassageIssue(body.passage);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    edit.passage = body.passage;
  }

  if (body.choices !== undefined) {
    if (
      !Array.isArray(body.choices)
      || body.choices.length === 0
      || !body.choices.every((choice) => isRecord(choice) && typeof choice.id === "string" && typeof choice.text === "string")
    ) {
      return NextResponse.json({ error: "Invalid choices" }, { status: 400 });
    }
    const choices = body.choices as { id: string; text: string }[];
    for (const choice of choices) {
      const issue = staffQuestionChoiceIssue(choice.text);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    }
    edit.choices = choices;
  }

  if (edit.prompt === undefined && edit.passage === undefined && edit.choices === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    await updateQuestionContent(session.email, normalizedType, id, edit);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not eligible for staff editing/i.test(message)) {
      return NextResponse.json({ error: "This question is not available to explanation editors." }, { status: 403 });
    }
    if (/choice ids must match/i.test(message)) {
      return NextResponse.json({ error: "Choices changed unexpectedly. Refresh and try again." }, { status: 409 });
    }
    reportServerError("manager.question_content.update_failed", error, {
      provider: "supabase",
      route: "/api/manager/questions/[targetType]/[id]",
      method: "PATCH",
    });
    return NextResponse.json({ error: "The question could not be updated." }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
