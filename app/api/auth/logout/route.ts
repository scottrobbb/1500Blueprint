import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appBaseUrl, SESSION_COOKIE } from "@/lib/auth/config";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { createClient } from "@/utils/supabase/server";
import { reportServerError } from "@/lib/observability/server";

export async function POST(request: Request) {
  if (isPasswordAuthEnabled()) {
    try {
      const supabase = createClient(await cookies());
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      // Legacy sign-out must always succeed even if Supabase is unavailable.
      reportServerError("auth.password_logout.failed", error, {
        provider: "supabase",
        route: "/api/auth/logout",
        method: "POST",
      });
    }
  }

  const base = appBaseUrl(new URL(request.url).origin);
  const response = NextResponse.redirect(new URL("/login", base), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
