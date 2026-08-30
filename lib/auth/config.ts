// Shared auth constants.

export const SESSION_COOKIE = "drill_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds
export const TOKEN_TTL_SECONDS = 60 * 15; // magic link is valid for 15 minutes

// Stripe subscription statuses that count as an active membership.
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export const CANONICAL_APP_URL = "https://www.1500satblueprint.com";

// Every production domain the app is intentionally reachable on. A request
// arriving on any of these is treated as first-party (same-origin checks,
// auth links, Stripe redirects all stay on the domain the visitor is
// actually using); anything else falls back to the canonical domain instead
// of trusting an arbitrary Host header.
const ADDITIONAL_APP_ORIGINS = ["https://1500blueprint.com", "https://www.1500blueprint.com"];
const ALLOWED_APP_ORIGINS = new Set<string>([CANONICAL_APP_URL, ...ADDITIONAL_APP_ORIGINS]);

export function resolveProductionOrigin(origin: string): string {
  return ALLOWED_APP_ORIGINS.has(origin) ? origin : CANONICAL_APP_URL;
}

// Production auth links use whichever known app domain the request actually
// came in on (see resolveProductionOrigin). Preview deployments keep their
// own origin so signup, recovery, and magic-link QA cannot jump into prod.
export function appBaseUrl(fallbackOrigin: string): string {
  if (process.env.VERCEL_ENV === "preview") {
    const previewUrl = process.env.AUTH_PREVIEW_URL?.trim()
      || process.env.VERCEL_URL?.trim()
      || fallbackOrigin;
    return normalizeBaseUrl(previewUrl);
  }
  if (process.env.NODE_ENV === "production") return resolveProductionOrigin(fallbackOrigin);

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return normalizeBaseUrl(configured || fallbackOrigin);
}

function normalizeBaseUrl(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

// Dev-only login bypass. Active ONLY when NODE_ENV !== "production" AND the email
// is allowlisted in DEV_BYPASS_EMAILS. Lets us into the gated site without
// Stripe/Resend while the real membership source is being wired up. Because
// Vercel sets NODE_ENV=production, this is inert in prod even if the env var leaks.
const DEV_BYPASS_EMAILS = (process.env.DEV_BYPASS_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isDevBypass(email: string): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    DEV_BYPASS_EMAILS.includes(email.trim().toLowerCase())
  );
}
