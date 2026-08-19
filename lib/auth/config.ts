// Shared auth constants.

export const SESSION_COOKIE = "drill_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds
export const TOKEN_TTL_SECONDS = 60 * 15; // magic link is valid for 15 minutes

// Stripe subscription statuses that count as an active membership.
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export const CANONICAL_APP_URL = "https://1500satblueprint.com";

// Production auth links and redirects always use the public domain, even when
// the request reaches a Vercel deployment URL. Development keeps its configured
// or request origin so localhost login testing still works.
export function appBaseUrl(fallbackOrigin: string): string {
  if (process.env.NODE_ENV === "production") return CANONICAL_APP_URL;

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const raw = configured || fallbackOrigin;
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
