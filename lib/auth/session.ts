import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { isPasswordAuthEnabled } from "./password";
import { COMPLIMENTARY_ACCESS_PLAN, hasComplimentaryAccess } from "./users";
import { sessionSecret } from "./session-secret";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type AuthMethod = "legacy" | "password";
export type Session = {
  email: string;
  plan: string | null;
  userId: string | null;
  authMethod: AuthMethod;
};
type LegacySessionInput = Pick<Session, "email" | "plan">;

type LegacyClaims = {
  subject: unknown;
  plan: unknown;
};

export type LegacySessionDependencies = {
  verifyToken(token: string): Promise<LegacyClaims>;
  hasActiveAccount(email: string): Promise<boolean>;
  hasComplimentaryAccess(email: string): Promise<boolean>;
};

type PasswordClaims = {
  email?: unknown;
  sub?: unknown;
};

export type PasswordSessionDependencies = {
  getClaims(): Promise<{ claims?: PasswordClaims; error?: unknown }>;
  hasActiveAccount(email: string, authUserId: string): Promise<boolean>;
};

function secret(): Uint8Array {
  return sessionSecret(process.env.AUTH_SECRET);
}

async function hasActiveAccount(email: string, authUserId?: string): Promise<boolean> {
  let query = supabaseAdmin()
    .from("users")
    .select("auth_user_id,account_status")
    .eq("email", email.trim().toLowerCase());
  if (authUserId) query = query.eq("auth_user_id", authUserId);
  const { data, error } = await query.maybeSingle<{
    auth_user_id: string | null;
    account_status: string;
  }>();
  if (error) throw new Error(`failed to validate session account: ${error.message}`);
  return data?.account_status === "active";
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

async function verifyLegacyToken(token: string): Promise<LegacyClaims> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  return { subject: payload.sub, plan: payload.plan };
}

export async function resolveLegacySessionToken(
  token: string,
  dependencies: LegacySessionDependencies,
): Promise<Session | null> {
  try {
    const claims = await dependencies.verifyToken(token);
    if (typeof claims.subject !== "string") return null;
    const email = claims.subject.trim().toLowerCase();
    if (!(await dependencies.hasActiveAccount(email))) return null;
    const plan = (claims.plan as string | null) ?? null;
    if (plan === COMPLIMENTARY_ACCESS_PLAN && !(await dependencies.hasComplimentaryAccess(email))) {
      return null;
    }
    return {
      email,
      plan,
      userId: null,
      authMethod: "legacy",
    };
  } catch {
    return null;
  }
}

// Legacy stays first so the current student login path retains identical behavior.
export async function getLegacySession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveLegacySessionToken(token, {
    verifyToken: verifyLegacyToken,
    hasActiveAccount: (email) => hasActiveAccount(email),
    hasComplimentaryAccess,
  });
}

export async function resolvePasswordSession(
  dependencies: PasswordSessionDependencies,
): Promise<Session | null> {
  const { claims, error } = await dependencies.getClaims();
  const email = claims?.email;
  const userId = claims?.sub;
  if (error || typeof email !== "string" || typeof userId !== "string") return null;

  const normalizedEmail = email.trim().toLowerCase();
  try {
    if (!(await dependencies.hasActiveAccount(normalizedEmail, userId))) return null;
  } catch {
    return null;
  }

  return {
    email: normalizedEmail,
    plan: null,
    userId,
    authMethod: "password",
  };
}

export async function getPasswordSession(): Promise<Session | null> {
  if (!isPasswordAuthEnabled()) return null;

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();
  return resolvePasswordSession({
    getClaims: async () => ({ claims: data?.claims, error }),
    hasActiveAccount,
  });
}

export async function resolveSession(dependencies: {
  legacySession(): Promise<Session | null>;
  passwordSession(): Promise<Session | null>;
}): Promise<Session | null> {
  return (await dependencies.legacySession()) ?? dependencies.passwordSession();
}

// Compatibility session resolver. Existing callers continue receiving email +
// plan, while password accounts can use the same pages and data-access code.
export async function getSession(): Promise<Session | null> {
  return resolveSession({
    legacySession: getLegacySession,
    passwordSession: getPasswordSession,
  });
}
