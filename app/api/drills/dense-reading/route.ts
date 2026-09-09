import { getSessionForDenseReading } from "@/lib/dense-reading/access";
import {
  createReadingSession,
  ReadingSessionError,
} from "@/lib/dense-reading/server";
import { drillAllowance } from "@/lib/auth/access-control";
import { readJsonBody, isSameOriginRequest } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const session = await getSessionForDenseReading();
    if (!session)
      return Response.json(
        { error: "Sign in with a plan that includes drills." },
        { status: 403 },
      );
    const rate = await checkRateLimit("dense-reading-start", session.email, {
      limit: 20,
      windowSeconds: 3600,
    });
    if (!rate)
      return Response.json(
        { error: "Practice is temporarily unavailable." },
        { status: 503 },
      );
    if (!rate.allowed)
      return Response.json(
        { error: "Too many new rounds. Try again later." },
        { status: 429 },
      );
    if (!(await drillAllowance(session.email)).allowed)
      return Response.json(
        { error: "Your drill allowance is used up. Try again when it resets." },
        { status: 402 },
      );
    const value = (await readJsonBody(request, 4096).catch(() => null)) as {
      id?: unknown;
      mode?: unknown;
      repeatId?: unknown;
    } | null;
    if (
      !value ||
      (value.mode !== "guided" && value.mode !== "regular") ||
      !uuid(value.id) ||
      (value.repeatId !== undefined && !uuid(value.repeatId))
    )
      return Response.json(
        { error: "Choose a practice mode." },
        { status: 400 },
      );
    const id = await createReadingSession(
      session.email,
      value.mode,
      value.id,
      value.repeatId as string | undefined,
    );
    return Response.json({ id });
  } catch (error) {
    reportServerError("dense_reading.start.failed", error, {
      provider: "supabase",
      route: "/api/drills/dense-reading",
      method: "POST",
    });
    return Response.json(
      {
        error:
          error instanceof ReadingSessionError
            ? error.message
            : "Practice could not be started.",
      },
      { status: error instanceof ReadingSessionError ? error.status : 500 },
    );
  }
}
function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
