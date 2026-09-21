import { NextResponse } from "next/server";
import { deleteStudentAccount } from "@/lib/account/deletion";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest } from "@/lib/security/request";

const FAILURE_MESSAGE: Record<string, string> = {
  not_found: "This account could not be found.",
  stripe_cancel_failed: "Your subscription could not be cancelled, so nothing was deleted. Try again in a moment.",
  erase_failed: "Your account could not be deleted. Nothing further was changed.",
};

export async function POST(request: Request) {
  // A form post from another site must not be able to delete an account on a
  // logged-in student's behalf.
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request" }, { status: 403 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit("account-delete", session.email, { limit: 5, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Account deletion is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts", resetsAt: rate.resetsAt }, { status: 429 });

  const outcome = await deleteStudentAccount(session.email);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: FAILURE_MESSAGE[outcome.reason] ?? FAILURE_MESSAGE.erase_failed },
      { status: outcome.reason === "not_found" ? 404 : 502 },
    );
  }

  const response = NextResponse.json({ ok: true, cancelledSubscriptions: outcome.cancelledSubscriptions });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
