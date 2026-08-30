import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reportServerError } from "@/lib/observability/server";
import { parseCompletionFailureDiagnostic } from "@/lib/sat/completionDiagnostics";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";

const MAX_DIAGNOSTIC_BYTES = 4 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  if (!isSameOriginRequest(request)) return new NextResponse(null, { status: 403 });

  const rate = await checkRateLimit(
    "practice-test-completion-telemetry",
    session.email,
    { limit: 60, windowSeconds: 60 * 60 },
  );
  if (!rate?.allowed) return new NextResponse(null, { status: 204 });

  const diagnostic = parseCompletionFailureDiagnostic(
    await readJsonBody(request, MAX_DIAGNOSTIC_BYTES).catch(() => null),
  );
  if (!diagnostic) return NextResponse.json({ error: "Invalid diagnostic" }, { status: 400 });

  reportServerError("practice_test.completion_client.failed", {
    name: diagnostic.errorName,
    code: diagnostic.code,
    status: diagnostic.status,
    requestId: diagnostic.requestId,
  }, {
    provider: "next",
    route: "/api/tests/complete",
    method: "POST",
    source: `${diagnostic.testSlug}:${diagnostic.kind}`,
    correlationId: diagnostic.requestId,
  });
  return new NextResponse(null, { status: 204 });
}
