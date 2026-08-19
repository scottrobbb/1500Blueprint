import { NextResponse } from "next/server";
import { SESSION_COOKIE, appBaseUrl } from "@/lib/auth/config";
import { consumeLoginToken } from "@/lib/auth/tokens";
import { signSession, sessionCookieOptions } from "@/lib/auth/session";
import {
  COMPLIMENTARY_ACCESS_PLAN,
  hasComplimentaryAccess,
  recordLogin,
} from "@/lib/auth/users";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const base = appBaseUrl(requestUrl.origin);
  const raw = requestUrl.searchParams.get("token");

  if (!raw) return NextResponse.redirect(new URL("/login?error=invalid", base));

  const result = await consumeLoginToken(raw);
  if (!result) return NextResponse.redirect(new URL("/login?error=expired", base));
  if (
    result.plan === COMPLIMENTARY_ACCESS_PLAN &&
    !(await hasComplimentaryAccess(result.email))
  ) {
    return NextResponse.redirect(new URL("/login?error=expired", base));
  }

  await recordLogin(result.email, result.plan);
  const token = await signSession({ email: result.email, plan: result.plan });
  const response = NextResponse.redirect(new URL("/drills", base));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
