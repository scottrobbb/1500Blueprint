import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { importVocabFlashcards } from "@/lib/drills/vocab.server";
import { parseVocabImport } from "@/lib/drills/vocabImport";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { isAdminEmail } from "@/lib/auth/admin";
import { contentLengthExceeds } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessDrillPublication("flashcards", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }
  if (contentLengthExceeds(request, MAX_CSV_BYTES + 256 * 1024)) {
    return NextResponse.json({ error: "The CSV file must be 10 MB or smaller." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Choose a valid CSV file to import." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || !file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Choose a CSV file to import." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "The CSV file must be 10 MB or smaller." }, { status: 413 });
  }

  try {
    const rate = await consumeRateLimit("vocab-csv-import", session.email, { limit: 10, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many imports. Try again later.", resetsAt: rate.resetsAt }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Imports are temporarily unavailable." }, { status: 503 });
  }

  const parsed = parseVocabImport(await file.text(), file.name);
  if (parsed.entries.length === 0 || parsed.errors.length > 0) {
    return NextResponse.json(
      {
        error:
          parsed.entries.length === 0
            ? "No valid flashcards were found."
            : "Fix the reported rows and upload the CSV again.",
        validRows: parsed.entries.length,
        errors: parsed.errors.slice(0, 100),
        errorCount: parsed.errors.length,
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      ...(await importVocabFlashcards(session.email, parsed.entries)),
    });
  } catch (error) {
    reportServerError("drill.vocab_flashcards.import_failed", error, {
      provider: "supabase",
      route: "/api/drills/vocab/flashcards/import",
      method: "POST",
    });
    return NextResponse.json({ error: "The flashcards could not be imported." }, { status: 500 });
  }
}
