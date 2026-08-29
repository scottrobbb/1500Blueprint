import { NextResponse } from "next/server";
import { SESSION_COOKIE, appBaseUrl } from "@/lib/auth/config";
import { consumeLoginToken } from "@/lib/auth/tokens";
import { signSession, sessionCookieOptions } from "@/lib/auth/session";
import { findStudentAccount } from "@/lib/auth/accounts";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { destinationAfterMagicLink } from "@/lib/auth/rollover";
import { reportServerError } from "@/lib/observability/server";
import {
  COMPLIMENTARY_ACCESS_PLAN,
  hasComplimentaryAccess,
  recordLogin,
} from "@/lib/auth/users";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const base = appBaseUrl(requestUrl.origin);
  const raw = requestUrl.searchParams.get("token");

  if (!raw || raw.length > 128) {
    return NextResponse.redirect(new URL("/login?error=invalid", base));
  }

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
  const passwordAuthEnabled = isPasswordAuthEnabled();
  let hasPasswordIdentity = false;
  if (passwordAuthEnabled) {
    try {
      hasPasswordIdentity = Boolean(await findStudentAccount(result.email));
    } catch (error) {
      reportServerError("auth.magic_link.rollover_lookup_failed", error, {
        provider: "supabase",
        route: "/api/auth/callback",
        method: "GET",
      });
      hasPasswordIdentity = true;
    }
  }
  const destination = destinationAfterMagicLink({
    passwordAuthEnabled,
    hasPasswordIdentity,
  });
  const response = NextResponse.redirect(new URL(destination, base));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
