import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { isAdminEmail } from "@/lib/auth/admin";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { isDrillUnderConstruction, isPracticeTestUnderConstruction } from "@/lib/flags";
import { updateSession as updatePasswordSession } from "@/utils/supabase/proxy";

// Paths reachable without a session.
const PUBLIC_PATHS = ["/login", "/pricing", "/account"];
// The admin CMS is gated to allowlisted admin emails (ADMIN_EMAILS).
const ADMIN_PREFIX = "/admin";
const ULTIMATE_PREFIX = "/ultimate";

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/billing/checkout" || pathname === "/api/billing/webhook") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function isUltimatePath(pathname: string): boolean {
  return pathname === ULTIMATE_PREFIX || pathname.startsWith(`${ULTIMATE_PREFIX}/`);
}

// Verify the session JWT and return its payload, or null if absent/invalid.
async function sessionPayload(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

// Next 16: this file replaces the old `middleware.ts` (Middleware → Proxy).
// Gates the drill site behind a session; only public marketing/auth pages and
// auth endpoints are reachable logged out. The /admin area additionally requires an
// admin email (defense-in-depth; pages/routes re-check via getAdminSession).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = isPublic(pathname);
  if (publicPath && !pathname.startsWith("/account")) return NextResponse.next();

  const legacyPayload = await sessionPayload(request);
  let email = typeof legacyPayload?.sub === "string" ? legacyPayload.sub : null;
  let passwordResponse: NextResponse | null = null;

  if (!email && isPasswordAuthEnabled()) {
    const passwordSession = await updatePasswordSession(request);
    passwordResponse = passwordSession.response;
    email = passwordSession.identity?.email ?? null;
  }

  if (publicPath) return passwordResponse ?? NextResponse.next();

  if (!email) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return redirectWithCookies(loginUrl, passwordResponse);
  }

  const isAdmin = isAdminEmail(email);

  if (isUltimatePath(pathname) && !isUltimatePreviewEmail(email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/drills";
    url.search = "";
    return redirectWithCookies(url, passwordResponse);
  }

  if (isAdminPath(pathname)) {
    if (!isAdmin) {
      // Signed-in non-admin (a student): bounce to the drills hub.
      const url = request.nextUrl.clone();
      url.pathname = "/drills";
      url.search = "";
      return redirectWithCookies(url, passwordResponse);
    }
  }

  // Keep unfinished drill players behind the hub's under-construction state
  // while preserving admin QA access.
  if (!isAdmin && pathname.startsWith("/drills/")) {
    const drillSlug = pathname.split("/")[2] ?? "";
    if (isDrillUnderConstruction(drillSlug)) {
      const url = request.nextUrl.clone();
      url.pathname = "/drills";
      url.search = "";
      return redirectWithCookies(url, passwordResponse);
    }
  }

  // Practice Tests 1-5 are under construction; Tests 6 and 7 are public to students.
  // API bodies are checked inside their route handlers because Proxy cannot
  // determine the requested test slug without consuming the request body.
  if (!isAdmin && pathname.startsWith("/practice-test/")) {
    const testSlug = pathname.split("/")[2] ?? "";
    if (isPracticeTestUnderConstruction(testSlug)) {
      const url = request.nextUrl.clone();
      url.pathname = "/practice-test";
      url.search = "";
      return redirectWithCookies(url, passwordResponse);
    }
  }

  return passwordResponse ?? NextResponse.next();
}

function redirectWithCookies(url: URL, source: NextResponse | null): NextResponse {
  const response = NextResponse.redirect(url);
  source?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
