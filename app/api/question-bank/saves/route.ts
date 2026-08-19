import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { setQuestionBankSaved } from "@/lib/question-bank/runner-state";

type SaveBody = {
  questionId: string;
};

export async function POST(request: Request) {
  return updateSavedQuestion(request, true);
}

export async function DELETE(request: Request) {
  return updateSavedQuestion(request, false);
}

async function updateSavedQuestion(request: Request, saved: boolean) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const input = parseBody(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Invalid question" }, { status: 400 });

  const ok = await setQuestionBankSaved(session.email, input.questionId, saved);
  if (!ok) return NextResponse.json({ error: "Question could not be saved" }, { status: 500 });
  return NextResponse.json({ saved });
}

function parseBody(value: unknown): SaveBody | null {
  if (typeof value !== "object" || value === null) return null;
  const questionId = "questionId" in value ? value.questionId : null;
  return typeof questionId === "string" && questionId.length > 0 && questionId.length <= 160
    ? { questionId }
    : null;
}
