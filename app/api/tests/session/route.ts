// In-progress practice-test persistence. The runner POSTs the serialized state
// here (on exit, on each module submit, and on a debounce while testing) so a
// student can resume exactly where they left off; DELETE clears it on "Start over".

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveTestSession, clearTestSession } from "@/lib/sat/testSession";
import type { TestState } from "@/lib/sat/testState";
import type { Highlight } from "@/components/test/HighlightablePassage";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessPracticeTestPublication } from "@/lib/sat/loadTest";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { reportServerError } from "@/lib/observability/server";
import { reportServerEvent } from "@/lib/observability/server";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { readIdempotencyToken } from "@/lib/idempotency";

const MAX_SESSION_BYTES = 512 * 1024;

type SaveBody = {
  testSlug?: string;
  state?: TestState;
  highlights?: Record<string, Highlight[]>;
};

export async function POST(req: NextRequest) {
  const requestId = readIdempotencyToken(req.headers.get("x-client-request-id")) ?? crypto.randomUUID();
  const saveReason = readSaveReason(req.headers.get("x-test-save-reason"));
  const session = await getSession();
  if (!session) return sessionError(requestId, 401, "unauthorized", "Unauthorized");
  const rate = await checkRateLimit("practice-test-session-write", session.email, { limit: 1_200, windowSeconds: 60 * 60 });
  if (!rate) return sessionError(requestId, 503, "rate_limit_unavailable", "Saving is temporarily unavailable");
  if (!rate.allowed) {
    return sessionError(requestId, 429, "rate_limited", "Too many save requests", { resetsAt: rate.resetsAt });
  }

  let body: SaveBody;
  try {
    const value = await readJsonBody(req, MAX_SESSION_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as SaveBody;
  } catch (error) {
    return sessionError(
      requestId,
      error instanceof RequestBodyTooLargeError ? 413 : 400,
      error instanceof RequestBodyTooLargeError ? "body_too_large" : "invalid_json",
      error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid JSON body",
    );
  }
  if (
    typeof body.testSlug !== "string"
    || body.testSlug.length === 0
    || body.testSlug.length > 160
    || !body.state
    || typeof body.state !== "object"
    || Array.isArray(body.state)
  ) {
    return sessionError(requestId, 400, "invalid_session", "testSlug and state are required");
  }
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin && !(await canAccessPracticeTest(session.email, body.testSlug))) {
    return sessionError(requestId, 402, "plan_limit", "This practice test is not included with your plan.");
  }
  if (!(await canAccessPracticeTestPublication(body.testSlug, isAdmin))) {
    return sessionError(requestId, 404, "test_not_published", "Practice test is not published");
  }

  try {
    await saveTestSession(session.email, body.testSlug, {
      state: body.state,
      highlights: body.highlights ?? {},
    });
  } catch (e) {
    reportServerError("practice_test.session_save.failed", e, {
      provider: "supabase",
      route: "/api/tests/session",
      method: "POST",
      correlationId: requestId,
      source: body.testSlug,
    });
    return NextResponse.json(
      { error: "Save failed", code: "persistence_failed", requestId },
      { status: 500 },
    );
  }
  if (saveReason === "exit") {
    reportServerEvent("practice_test.session_exit.saved", {
      provider: "next",
      route: "/api/tests/session",
      method: "POST",
      source: body.testSlug,
      correlationId: requestId,
      reason: saveReason,
      phase: body.state.phase,
      sectionIndex: body.state.sectionIndex,
      moduleOrder: body.state.moduleOrder,
      questionIndex: body.state.qIndex,
    });
  }
  return NextResponse.json({ ok: true, requestId });
}

function readSaveReason(value: string | null): "autosave" | "interval" | "exit" | "visibility" {
  if (value === "interval" || value === "exit" || value === "visibility") return value;
  return "autosave";
}

function sessionError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  reportServerError("practice_test.session_save.rejected", {
    name: "PracticeTestSessionSaveRejected",
    code,
    status,
    requestId,
  }, {
    provider: "next",
    route: "/api/tests/session",
    method: "POST",
    correlationId: requestId,
  });
  return NextResponse.json({ error: message, code, requestId, ...extra }, { status });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("practice-test-session-clear", session.email, { limit: 60, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many clear requests", resetsAt: rate.resetsAt }, { status: 429 });

  const testSlug = new URL(req.url).searchParams.get("testSlug");
  if (!testSlug || testSlug.length > 160) {
    return NextResponse.json({ error: "testSlug is required" }, { status: 400 });
  }
  if (!(await canAccessPracticeTestPublication(testSlug, isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Practice test is not published" }, { status: 404 });
  }

  try {
    await clearTestSession(session.email, testSlug);
  } catch (e) {
    reportServerError("practice_test.session_clear.failed", e, {
      provider: "supabase",
      route: "/api/tests/session",
      method: "DELETE",
    });
    return NextResponse.json({ error: "Clear failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
