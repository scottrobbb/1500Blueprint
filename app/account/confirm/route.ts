import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recordPasswordLogin } from "@/lib/auth/accounts";
import { appBaseUrl } from "@/lib/auth/config";
import {
  isPasswordAuthEnabled,
  isPasswordSignupEnabled,
  safeNextPath,
} from "@/lib/auth/password";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const base = appBaseUrl(requestUrl.origin);
  if (!isPasswordAuthEnabled()) return NextResponse.redirect(new URL("/login", base));

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const verificationType = requestUrl.searchParams.get("type");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const isEmailVerification = verificationType === "signup" || verificationType === "recovery";
  if (!code && (!tokenHash || !isEmailVerification)) {
    return NextResponse.redirect(new URL("/account/login?error=confirmation", base));
  }

  const supabase = createClient(await cookies());
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: verificationType as "signup" | "recovery",
      });
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/account/login?error=confirmation", base));
  }

  try {
    const account = await recordPasswordLogin(data.user, {
      allowCreate: isPasswordSignupEnabled(),
    });
    if (account.status !== "active") {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(new URL("/account/login?error=account", base));
    }
  } catch (accountError) {
    console.error("auth confirmation account link failed:", accountError);
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/account/login?error=account", base));
  }

  return NextResponse.redirect(new URL(next, base));
}
