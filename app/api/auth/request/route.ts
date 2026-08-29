import { NextResponse } from "next/server";
import { SESSION_COOKIE, appBaseUrl, isDevBypass } from "@/lib/auth/config";
import { isAdminEmail } from "@/lib/auth/admin";
import { getMembership } from "@/lib/auth/stripe";
import { createLoginToken } from "@/lib/auth/tokens";
import { sendMagicLink } from "@/lib/auth/email";
import { signSession, sessionCookieOptions } from "@/lib/auth/session";
import {
  COMPLIMENTARY_ACCESS_PLAN,
  hasComplimentaryAccess,
  recordLogin,
} from "@/lib/auth/users";
import {
  clientAddress,
  contentLengthExceeds,
  normalizeEmailInput,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

const GENERIC_MESSAGE =
  "If that email has an active membership, a login link is on its way.";
const MAX_REQUEST_BYTES = 8 * 1024;

export async function POST(request: Request) {
  if (contentLengthExceeds(request, MAX_REQUEST_BYTES)) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 413 });
  }

  let email: string | null = null;
  try {
    const body = await readJsonBody(request, MAX_REQUEST_BYTES) as Record<string, unknown>;
    // Canonicalize once: the same value is used for the membership check, the
    // token row, the email recipient, and the session subject.
    email = normalizeEmailInput(body?.email);
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: "Invalid request." },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  if (!email) {
    return NextResponse.json({ ok: false, message: "Enter a valid email." }, { status: 400 });
  }

  try {
    const [addressLimit, emailLimit] = await Promise.all([
      consumeRateLimit("auth-request-address", clientAddress(request), { limit: 10, windowSeconds: 15 * 60 }),
      consumeRateLimit("auth-request-email", email, { limit: 5, windowSeconds: 15 * 60 }),
    ]);
    if (!addressLimit.allowed || !emailLimit.allowed) {
      const resetsAt = [addressLimit.resetsAt, emailLimit.resetsAt]
        .map(Date.parse)
        .filter(Number.isFinite)
        .reduce((latest, value) => Math.max(latest, value), Date.now());
      return NextResponse.json(
        { ok: false, message: "Too many login attempts. Try again shortly." },
        {
          status: 429,
          headers: { "retry-after": String(Math.max(1, Math.ceil((resetsAt - Date.now()) / 1000))) },
        },
      );
    }
  } catch (error) {
    reportServerError("auth.magic_link.rate_limit_failed", error, {
      provider: "supabase",
      route: "/api/auth/request",
      method: "POST",
    });
    return NextResponse.json(
      { ok: false, message: "Login is temporarily unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // Dev-only bypass: log allowlisted emails straight in, skipping Stripe + Resend
  // + the token table. Inert in production (see isDevBypass).
  if (isDevBypass(email)) {
    await recordLogin(email, "dev");
    const token = await signSession({ email, plan: "dev" });
    const response = NextResponse.json({ ok: true, redirect: "/drills" });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  }

  try {
    const complimentary = await hasComplimentaryAccess(email);
    // Administrators still receive a login path without needing a paid Stripe
    // subscription, but must prove mailbox possession. A shared static key must
    // never mint an immediate production admin session.
    const membership = isAdminEmail(email)
      ? { active: true, plan: "admin" }
      : complimentary
      ? { active: true, plan: COMPLIMENTARY_ACCESS_PLAN }
      : await getMembership(email);
    if (membership.active) {
      const token = await createLoginToken(email, membership.plan);
      const base = appBaseUrl(new URL(request.url).origin);
      const url = `${base}/api/auth/callback?token=${encodeURIComponent(token.raw)}`;
      await sendMagicLink(email, url, token.id);
    }
  } catch (error) {
    // Don't leak which step failed; the student still sees the generic message.
    reportServerError("auth.magic_link.request_failed", error, {
      route: "/api/auth/request",
      method: "POST",
    });
  }

  // Always generic so we never reveal who is or isn't a member (anti-enumeration).
  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
