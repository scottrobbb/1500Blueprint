import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { COMPLIMENTARY_ACCESS_PLAN, hasComplimentaryAccess } from "./users";

export type Session = { email: string; plan: string | null };

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(value);
}

// Sign a session as a JWT. The caller sets it as a cookie on its response.
export async function signSession(session: Session): Promise<string> {
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

// Read + verify the current session from the request cookies. null if absent or invalid.
export async function getSession(): Promise<Session | null> {
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
    return { email: payload.sub, plan };
  } catch {
    return null;
  }
}
