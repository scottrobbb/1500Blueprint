// Shared auth constants.

export const SESSION_COOKIE = "drill_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds
export const TOKEN_TTL_SECONDS = 60 * 15; // magic link is valid for 15 minutes

// Stripe subscription statuses that count as an active membership.
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

const FALLBACK_CANONICAL_APP_URL = "https://www.1500satblueprint.com";
const MAX_ALLOWED_APP_ORIGINS = 8;
const MAX_ALLOWED_APP_ORIGINS_LENGTH = 2048;

export function canonicalAppUrl(): string {
  return validateHttpsAppOrigin(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || FALLBACK_CANONICAL_APP_URL,
    "NEXT_PUBLIC_APP_URL",
  );
}

export function allowedAppOrigins(): ReadonlySet<string> {
  const origins = new Set([canonicalAppUrl()]);
  const configured = process.env.APP_ALLOWED_ORIGINS?.trim();
  if (!configured) return origins;
  if (configured.length > MAX_ALLOWED_APP_ORIGINS_LENGTH) {
    throw new Error("APP_ALLOWED_ORIGINS is too long");
  }

  const entries = configured.split(",").map((value) => value.trim());
  if (entries.length > MAX_ALLOWED_APP_ORIGINS || entries.some((value) => !value)) {
    throw new Error(`APP_ALLOWED_ORIGINS must contain 1-${MAX_ALLOWED_APP_ORIGINS} origins`);
  }
  entries.forEach((value) => origins.add(validateHttpsAppOrigin(value, "APP_ALLOWED_ORIGINS")));
  return origins;
}

// Production auth links always use the public domain. Preview deployments keep
// their own origin so signup, recovery, and magic-link QA cannot jump into prod.
export function appBaseUrl(fallbackOrigin: string): string {
  if (process.env.VERCEL_ENV === "preview") {
    const previewUrl = process.env.AUTH_PREVIEW_URL?.trim()
      || process.env.VERCEL_URL?.trim()
      || fallbackOrigin;
    return normalizeBaseUrl(previewUrl);
  }
  if (process.env.NODE_ENV === "production") return productionAppUrl(fallbackOrigin);

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return normalizeBaseUrl(configured || fallbackOrigin);
}

export function productionAppUrl(requestUrl: string): string {
  const canonicalUrl = canonicalAppUrl();
  let requestOrigin: string;
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    return canonicalUrl;
  }
  return allowedAppOrigins().has(requestOrigin) ? requestOrigin : canonicalUrl;
}

export function magicLinkCallbackUrl(token: string, fallbackOrigin: string): string {
  const url = new URL("/api/auth/callback", appBaseUrl(fallbackOrigin));
  url.searchParams.set("token", token);
  return url.toString();
}

export function accountConfirmationUrl(
  tokenHash: string,
  type: "signup" | "recovery",
  next: string,
  fallbackOrigin: string,
): string {
  const url = new URL("/account/confirm", appBaseUrl(fallbackOrigin));
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

function validateHttpsAppOrigin(raw: string, variableName: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${variableName} must contain valid absolute URLs`);
  }

  const validHostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  if (
    url.protocol !== "https:"
    || !validHostname.test(url.hostname)
    || url.username
    || url.password
    || url.port
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(
      `${variableName} must contain only HTTPS origins with valid DNS hostnames`,
    );
  }
  return url.origin;
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
