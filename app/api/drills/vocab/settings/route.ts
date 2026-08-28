import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateVocabAutoAdd } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("vocab-settings-write", session.email, { limit: 120, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Settings are temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many settings requests", resetsAt: rate.resetsAt }, { status: 429 });
  if (!(await canAccessDrillPublication("vocab", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as { autoAddFlashcards?: unknown } | null;
  if (typeof body?.autoAddFlashcards !== "boolean") {
    return NextResponse.json({ error: "autoAddFlashcards must be a boolean." }, { status: 400 });
  }
  try {
    await updateVocabAutoAdd(session.email, body.autoAddFlashcards);
    return NextResponse.json({ ok: true, autoAddFlashcards: body.autoAddFlashcards });
  } catch (error) {
    reportServerError("drill.vocab.setting_update_failed", error, {
      provider: "supabase",
      route: "/api/drills/vocab/settings",
      method: "PATCH",
    });
    return NextResponse.json({ error: "Could not save the vocab setting." }, { status: 500 });
  }
}
