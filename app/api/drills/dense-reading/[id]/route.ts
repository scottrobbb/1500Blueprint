import { getSessionForDenseReading } from "@/lib/dense-reading/access";
import {
  ReadingSessionError,
  saveReadingSession,
} from "@/lib/dense-reading/server";
import {
  isSameOriginRequest,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const session = await getSessionForDenseReading();
    if (!session)
      return Response.json(
        { error: "Your account cannot access this drill." },
        { status: 403 },
      );
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return Response.json({ error: "Session not found" }, { status: 404 });
    const rate = await checkRateLimit("dense-reading-save", session.email, {
      limit: 1200,
      windowSeconds: 3600,
    });
    if (!rate)
      return Response.json(
        { error: "Saving is temporarily unavailable." },
        { status: 503 },
      );
    if (!rate.allowed)
      return Response.json(
        { error: "Too many save requests. Wait a moment and retry." },
        { status: 429 },
      );
    const body = (await readJsonBody(request, 512 * 1024)) as {
      revision?: unknown;
      state?: unknown;
      complete?: unknown;
    } | null;
    if (
      !body ||
      !Number.isInteger(body.revision) ||
      Number(body.revision) < 0 ||
      (body.complete !== undefined && typeof body.complete !== "boolean")
    )
      return Response.json(
        { error: "Invalid session update." },
        { status: 400 },
      );
    const result = await saveReadingSession(
      session.email,
      id,
      body.revision as number,
      body.state,
      body.complete === true,
    );
    return Response.json(
      { session: result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    reportServerError("dense_reading.save.failed", error, {
      provider: "supabase",
      route: "/api/drills/dense-reading/[id]",
      method: "PATCH",
    });
    return Response.json(
      {
        error:
          error instanceof ReadingSessionError
            ? error.message
            : "Your progress could not be saved. Please retry.",
      },
      {
        status:
          error instanceof RequestBodyTooLargeError
            ? 413
            : error instanceof SyntaxError
              ? 400
              : error instanceof ReadingSessionError
                ? error.status
                : 500,
      },
    );
  }
}
