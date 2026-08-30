import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { canEditSet, deleteSet, updateSet } from "@/lib/flashcards/queries";
import { MAX_FLASHCARD_SET_BYTES, parseSetInput } from "@/lib/flashcards/input";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Update / delete a single set. Editable by its owner or any admin. Next 16:
// ctx.params is a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin) {
    const access = await getStudentAccess(session.email);
    if (!access.entitlements.flashcards) {
      return NextResponse.json({ error: "Flashcards are included with Max.", code: "plan_limit" }, { status: 402 });
    }
  }

  const { id } = await ctx.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "invalid_set" }, { status: 400 });
  if (!(await canEditSet(id, session.email)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let value: unknown;
  try {
    value = await readJsonBody(req, MAX_FLASHCARD_SET_BYTES);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "too_large" : "invalid_body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  const input = parseSetInput(value, isAdmin);
  if (!input) return NextResponse.json({ error: "invalid_set" }, { status: 400 });
  try {
    const rate = await consumeRateLimit("flashcard-set-write", session.email, { limit: 60, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  const ok = await updateSet(id, input);
  if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminEmail(session.email)) {
    const access = await getStudentAccess(session.email);
    if (!access.entitlements.flashcards) {
      return NextResponse.json({ error: "Flashcards are included with Max.", code: "plan_limit" }, { status: 402 });
    }
  }

  const { id } = await ctx.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "invalid_set" }, { status: 400 });
  if (!(await canEditSet(id, session.email)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await deleteSet(id);
  return NextResponse.json({ ok: true });
}
