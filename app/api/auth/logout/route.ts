import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  if (isPasswordAuthEnabled()) {
    try {
      const supabase = createClient(await cookies());
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      // Legacy sign-out must always succeed even if Supabase is unavailable.
      console.error("password sign-out failed:", error);
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/login", base), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
