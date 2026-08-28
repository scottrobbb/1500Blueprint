import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseQuestionReportInput } from "@/lib/question-reports/input";
import {
  createQuestionReport,
  questionReportTargetExists,
} from "@/lib/question-reports/queries";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  isSameOriginRequest,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/security/request";

const MAX_REPORT_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to report a question." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const rate = await checkRateLimit("question-report", session.email, {
    limit: 20,
    windowSeconds: 24 * 60 * 60,
  });
  if (!rate) {
    return NextResponse.json({ error: "Reporting is temporarily unavailable." }, { status: 503 });
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "You have submitted too many reports today.", resetsAt: rate.resetsAt },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_REPORT_BYTES);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "Report is too large." : "Invalid request body." },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const parsed = parseQuestionReportInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const exists = await questionReportTargetExists(
      parsed.value.targetType,
      parsed.value.questionId,
    );
    if (!exists) return NextResponse.json({ error: "This question is no longer available." }, { status: 404 });

    const report = await createQuestionReport({
      ...parsed.value,
      reporterEmail: session.email,
      reporterAuthUserId: session.userId,
    });
    return NextResponse.json({ reportId: report.id }, { status: 201 });
  } catch (error) {
    reportServerError("question_report.create_failed", error, {
      provider: "supabase",
      route: "/api/questions/report",
      method: "POST",
    });
    return NextResponse.json({ error: "The report could not be submitted." }, { status: 500 });
  }
}
