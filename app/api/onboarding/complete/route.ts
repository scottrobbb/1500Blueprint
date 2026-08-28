import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markOnboarded } from "@/lib/gamification/state";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const rate = await checkRateLimit("onboarding-completion", session.email, { limit: 20, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Onboarding is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many completion requests", resetsAt: rate.resetsAt }, { status: 429 });
  await markOnboarded(session.email);
  return NextResponse.json({ ok: true });
}
