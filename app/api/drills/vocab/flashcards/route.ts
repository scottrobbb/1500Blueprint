import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { removeVocabFlashcard, saveVocabFlashcard } from "@/lib/drills/vocab.server";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";

async function questionIdFrom(request: Request): Promise<string | null> {
  const body = (await request.json().catch(() => null)) as { questionId?: unknown } | null;
  return typeof body?.questionId === "string" ? body.questionId : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessDrillPublication("flashcards", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const questionId = await questionIdFrom(request);
  if (!questionId) return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  try {
    await saveVocabFlashcard(session.email, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Vocab flashcard save failed", error);
    return NextResponse.json({ error: "Could not save the vocab flashcard." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessDrillPublication("flashcards", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  const questionId = await questionIdFrom(request);
  if (!questionId) return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  try {
    await removeVocabFlashcard(session.email, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Vocab flashcard removal failed", error);
    return NextResponse.json({ error: "Could not remove the vocab flashcard." }, { status: 500 });
  }
}
