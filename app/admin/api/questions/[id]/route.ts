import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  deleteQuestion,
  getQuestion,
  ContentPublicationError,
  QuestionHasHistoryError,
  replaceWalkthrough,
  updateQuestion,
  type QuestionInput,
  type WalkthroughStepInput,
} from "@/lib/drills/admin-queries";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

// Single-question CMS endpoint. Every method authorizes with getAdminSession()
// before touching the service-role queries. Next 16: ctx.params is a Promise.
type Ctx = { params: Promise<{ id: string }> };

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { id } = await ctx.params;
  const question = await getQuestion(id);
  if (!question) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(question);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { id } = await ctx.params;
  const body = (await readJsonBody(req, 1024 * 1024).catch(() => null)) as {
    question: QuestionInput;
    walkthrough: WalkthroughStepInput[];
  } | null;
  if (
    !body?.question
    || !Array.isArray(body.walkthrough)
    || typeof body.question.includeInQuestionBank !== "boolean"
    || typeof body.question.questionBankFreeTier !== "boolean"
    || typeof body.question.visibleInDrill !== "boolean"
  ) {
    return NextResponse.json({ error: "invalid_body", detail: "Question metadata and walkthrough steps are required." }, { status: 400 });
  }
  // Trust the route id over the body so the two writes always target one row.
  try {
    await updateQuestion({ ...body.question, id });
    await replaceWalkthrough(id, body.walkthrough);
  } catch (error) {
    const invalidContent = error instanceof ContentPublicationError;
    if (!invalidContent) {
      reportServerError("admin.drill_question.save_failed", error, {
        provider: "supabase",
        route: "/admin/api/questions/[id]",
        method: "PUT",
      });
    }
    const detail = invalidContent
      ? error.message
      : "The question could not be saved. Verify its publication and Question Bank settings.";
    return NextResponse.json({ error: "save_failed", detail }, { status: invalidContent ? 400 : 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { id } = await ctx.params;
  try {
    await deleteQuestion(id);
  } catch (error) {
    const hasHistory = error instanceof QuestionHasHistoryError;
    if (!hasHistory) {
      reportServerError("admin.drill_question.delete_failed", error, {
        provider: "supabase",
        route: "/admin/api/questions/[id]",
        method: "DELETE",
      });
    }
    return NextResponse.json(
      {
        error: "delete_failed",
        detail: hasHistory
          ? error.message
          : "The question could not be deleted because of a database error. No content was removed.",
      },
      { status: hasHistory ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
