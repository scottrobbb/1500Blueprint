import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { completeVocabSession } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("vocab-session-completion", session.email, { limit: 120, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Session saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many completion requests", resetsAt: rate.resetsAt }, { status: 429 });
  const isAdmin = isAdminEmail(session.email);
  if (!(await canAccessDrillPublication("vocab", isAdmin))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as
    | { durationSeconds?: unknown; clientToken?: unknown }
    | null;
  if (
    !Number.isInteger(body?.durationSeconds)
    || typeof body?.clientToken !== "string"
    || body.clientToken.length === 0
    || body.clientToken.length > 200
    || (body.durationSeconds as number) < 0
    || (body.durationSeconds as number) > 86_400
  ) {
    return NextResponse.json({ error: "Invalid seven-question vocab session." }, { status: 400 });
  }
  try {
    const award = await completeVocabSession(session.email, {
      durationSeconds: body.durationSeconds as number,
      clientToken: body.clientToken,
    });
    return NextResponse.json({ ok: true, ...award });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const planLimit = /not included|daily limit/i.test(message);
    const incomplete = /requires .* saved answers/i.test(message);
    if (!planLimit && !incomplete) {
      reportServerError("drill.vocab.session_completion_failed", error, {
        provider: "supabase",
        route: "/api/drills/vocab/session",
        method: "POST",
      });
    }
    return NextResponse.json(
      { error: planLimit ? "Drill access is not available." : incomplete ? message : "Could not save the vocab session.", code: planLimit ? "plan_limit" : "save_failed" },
      { status: planLimit ? 402 : incomplete ? 409 : 500 },
    );
  }
}
