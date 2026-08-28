import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toggleLike } from "@/lib/community/queries";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Toggle the current member's like on a post; returns { liked, likes }.
// Next 16: ctx.params is a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "invalid_post" }, { status: 400 });
  try {
    const rate = await consumeRateLimit("community-like", session.email, { limit: 120, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  const result = await toggleLike(id, session.email);
  return NextResponse.json(result);
}
