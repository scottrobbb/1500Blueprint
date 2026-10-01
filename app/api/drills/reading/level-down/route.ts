// Moves a student down one level in the Reading Comprehension Drill, after the
// drill has asked them to confirm twice. Idempotent on clientToken, so a
// double-submitted confirmation drops one level, not two.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readIdempotencyToken } from "@/lib/idempotency";
import { loadReadingProgress, recordReadingLevelDrop } from "@/lib/drills/progress";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let clientToken: string | null;
  try {
    clientToken = readIdempotencyToken(((await readJsonBody(request, 1024)) as { clientToken?: unknown } | null)?.clientToken);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!clientToken) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  try {
    const rate = await consumeRateLimit("reading-level-down", session.email, { limit: 20, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many level changes. Try again later." }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "Level changes are unavailable right now." }, { status: 503 });
  }

  try {
    const current = await loadReadingProgress(session.email);
    if (current.level <= 1) {
      return NextResponse.json({ error: "You are already on level 1.", progress: current }, { status: 409 });
    }
    await recordReadingLevelDrop(session.email, clientToken);
    return NextResponse.json({ progress: await loadReadingProgress(session.email) });
  } catch {
    return NextResponse.json({ error: "We couldn't change your level. Try again in a moment." }, { status: 503 });
  }
}
