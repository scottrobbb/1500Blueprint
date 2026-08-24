import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { isPasswordAuthEnabled } from "./password";
import { COMPLIMENTARY_ACCESS_PLAN, hasComplimentaryAccess } from "./users";

export type AuthMethod = "legacy" | "password";
export type Session = {
  email: string;
  plan: string | null;
  userId: string | null;
  authMethod: AuthMethod;
};
type LegacySessionInput = Pick<Session, "email" | "plan">;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(value);
}

// Sign a session as a JWT. The caller sets it as a cookie on its response.
export async function signSession(session: LegacySessionInput): Promise<string> {
  return new SignJWT({ plan: session.plan })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// Legacy stays first so the current student login path retains identical behavior.
export async function getLegacySession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const plan = (payload.plan as string | null) ?? null;
    if (plan === COMPLIMENTARY_ACCESS_PLAN && !(await hasComplimentaryAccess(payload.sub))) {
      return null;
    }
    return {
      email: payload.sub,
      plan,
      userId: null,
      authMethod: "legacy",
    };
  } catch {
    return null;
  }
}

export async function getPasswordSession(): Promise<Session | null> {
  if (!isPasswordAuthEnabled()) return null;

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  const userId = data?.claims.sub;
  if (error || typeof email !== "string" || typeof userId !== "string") return null;

  return {
    email: email.trim().toLowerCase(),
    plan: null,
    userId,
    authMethod: "password",
  };
}

// Compatibility session resolver. Existing callers continue receiving email +
// plan, while password accounts can use the same pages and data-access code.
export async function getSession(): Promise<Session | null> {
  return (await getLegacySession()) ?? getPasswordSession();
}
