import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { isAdminEmail } from "@/lib/auth/admin";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { isDrillUnderConstruction, isPracticeTestUnderConstruction } from "@/lib/flags";

// Paths reachable without a session.
const PUBLIC_PATHS = ["/login", "/pricing"];
// The admin CMS is gated to allowlisted admin emails (ADMIN_EMAILS).
const ADMIN_PREFIX = "/admin";
const ULTIMATE_PREFIX = "/ultimate";

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
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
  if (isPublic(pathname)) return NextResponse.next();

  const payload = await sessionPayload(request);
  if (!payload) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  const email = typeof payload.sub === "string" ? payload.sub : null;
  const isAdmin = isAdminEmail(email);

  if (isUltimatePath(pathname) && !isUltimatePreviewEmail(email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/drills";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAdminPath(pathname)) {
    if (!isAdmin) {
      // Signed-in non-admin (a student): bounce to the drills hub.
      const url = request.nextUrl.clone();
      url.pathname = "/drills";
      url.search = "";
      return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
