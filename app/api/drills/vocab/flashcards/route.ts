import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { removeVocabFlashcard, saveVocabFlashcard } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

async function questionIdFrom(request: Request): Promise<string | null> {
  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as { questionId?: unknown } | null;
  return typeof body?.questionId === "string" && body.questionId.length > 0 && body.questionId.length <= 160
    ? body.questionId
    : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("vocab-flashcard-write", session.email, { limit: 600, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Flashcard saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many flashcard requests", resetsAt: rate.resetsAt }, { status: 429 });
  if (!(await canAccessDrillPublication("flashcards", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const questionId = await questionIdFrom(request);
  if (!questionId) return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  try {
    await saveVocabFlashcard(session.email, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportServerError("drill.vocab_flashcard.save_failed", error, {
      provider: "supabase",
      route: "/api/drills/vocab/flashcards",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not save the vocab flashcard." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("vocab-flashcard-write", session.email, { limit: 600, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Flashcard saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many flashcard requests", resetsAt: rate.resetsAt }, { status: 429 });
  if (!(await canAccessDrillPublication("flashcards", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const questionId = await questionIdFrom(request);
  if (!questionId) return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  try {
    await removeVocabFlashcard(session.email, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportServerError("drill.vocab_flashcard.remove_failed", error, {
      provider: "supabase",
      route: "/api/drills/vocab/flashcards",
      method: "DELETE",
    });
    return NextResponse.json({ error: "Could not remove the vocab flashcard." }, { status: 500 });
  }
}
