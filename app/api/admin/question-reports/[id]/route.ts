import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  QuestionReportNotFoundError,
  type QuestionReportStatus,
  updateQuestionReportStatus,
} from "@/lib/question-reports/queries";
import { reportServerError } from "@/lib/observability/server";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";

const STATUSES: QuestionReportStatus[] = ["open", "resolved", "dismissed"];
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id || id.length > 160) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }
  const body = (await readJsonBody(request, 2 * 1024).catch(() => null)) as {
    status?: unknown;
  } | null;
  if (!body || typeof body.status !== "string" || !STATUSES.includes(body.status as QuestionReportStatus)) {
    return NextResponse.json({ error: "Invalid report status" }, { status: 400 });
  }

  try {
    const status = body.status as QuestionReportStatus;
    await updateQuestionReportStatus(id, status, session.email);
    return NextResponse.json({ id, status });
  } catch (error) {
    if (error instanceof QuestionReportNotFoundError) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    reportServerError("admin.question_report.update_failed", error, {
      provider: "supabase",
      route: "/api/admin/question-reports/[id]",
      method: "PATCH",
    });
    return NextResponse.json({ error: "The report could not be updated." }, { status: 500 });
  }
}
