import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import { canonicalHostRedirect, SESSION_COOKIE } from "@/lib/auth/config";
import { isAdminEmail } from "@/lib/auth/admin";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { updateSession as updatePasswordSession } from "@/utils/supabase/proxy";
import { sessionSecret } from "@/lib/auth/session-secret";
import { enforceProtectedContentRead } from "@/lib/security/protected-content";

// Paths reachable without a session.
const PUBLIC_PATHS = ["/", "/login", "/pricing", "/free", "/max", "/account", "/robots.txt", "/sitemap.xml"];
// The admin CMS is gated to allowlisted admin emails (ADMIN_EMAILS).
const ADMIN_PREFIX = "/admin";

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/billing/checkout" || pathname === "/api/billing/webhook") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

// Verify the session JWT and return its payload, or null if absent/invalid.
async function sessionPayload(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(secret), {
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
  // Before anything else: a request on a host this app does not own -- the
  // deployment's own *.vercel.app URL, in practice -- is moved to the canonical
  // domain, path and query intact. Every redirect below clones nextUrl and so
  // preserves whatever host it arrived on, which is right for the second
  // production domain and wrong for that one.
  const canonicalUrl = canonicalHostRedirect(request.nextUrl.toString());
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308);

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
    if (isPasswordAuthEnabled()) {
      const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      loginUrl.pathname = "/account/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", next);
    } else {
      loginUrl.pathname = "/login";
      loginUrl.search = "";
    }
    return redirectWithCookies(loginUrl, passwordResponse);
  }

  const isAdmin = isAdminEmail(email);

  if (!isAdmin) {
    const contentRead = await enforceProtectedContentRead(email, pathname);
    if (!contentRead.allowed) {
      const retryAfter = contentRead.resetsAt
        ? Math.max(1, Math.ceil((Date.parse(contentRead.resetsAt) - Date.now()) / 1000))
        : 60;
      return responseWithCookies(
        NextResponse.json(
          {
            error: "Too many protected-content requests. Continue after the limit resets.",
            code: "content_read_limit",
            resetsAt: contentRead.resetsAt,
          },
          {
            status: 429,
            headers: {
              "cache-control": "private, no-store",
              "retry-after": String(retryAfter),
            },
          },
        ),
        passwordResponse,
      );
    }
  }

  if (isAdminPath(pathname)) {
    if (!isAdmin) {
      // Signed-in non-admins return to the student workspace.
      const url = request.nextUrl.clone();
      url.pathname = "/ultimate";
      url.search = "";
      return redirectWithCookies(url, passwordResponse);
    }
  }

  return passwordResponse ?? NextResponse.next();
}

function redirectWithCookies(url: URL, source: NextResponse | null): NextResponse {
  return responseWithCookies(NextResponse.redirect(url), source);
}

function responseWithCookies(response: NextResponse, source: NextResponse | null): NextResponse {
  source?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
