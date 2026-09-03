// Shared auth constants.

export const SESSION_COOKIE = "drill_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds
export const TOKEN_TTL_SECONDS = 60 * 15; // magic link is valid for 15 minutes

// Stripe subscription statuses that count as an active membership.
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const FALLBACK_CANONICAL_APP_URL = "https://1500blueprint.com";
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

// Vercel gives every deployment a *.vercel.app hostname, and the production one
// serves the real app. Anyone who lands there gets a working parallel copy of
// the site they cannot leave -- every proxy redirect preserves the incoming
// host -- and whose checkout silently 403s, because billingBaseUrl resolves to
// the canonical origin and the same-origin check then rejects the POST.
//
// Returns the canonical URL such a request should be sent to, or null to leave
// it alone. Every origin in allowedAppOrigins() is left alone, which is what
// keeps a second production domain working.
export function canonicalHostRedirect(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  // Checked before VERCEL_ENV, not after: a local .env may pin VERCEL_ENV to
  // "production" to exercise production code paths, and without this a
  // developer loading localhost would be redirected to the live site.
  if (LOOPBACK_HOSTNAMES.has(url.hostname)) return null;

  // Preview deployments are meant to live on their own *.vercel.app host.
  if (process.env.VERCEL_ENV !== "production") return null;

  // A webhook sender holds a fixed URL, so redirecting one breaks delivery
  // rather than relocating a person. Only navigations are worth moving.
  if (url.pathname.startsWith("/api/")) return null;

  // Compared by host, not full origin: a proxied http:// origin would otherwise
  // look foreign and bounce a legitimate domain to canonical.
  const allowedHosts = new Set(
    [...allowedAppOrigins()].map((origin) => new URL(origin).host),
  );
  if (allowedHosts.has(url.host)) return null;

  const target = new URL(canonicalAppUrl());
  target.pathname = url.pathname;
  target.search = url.search;
  return target.toString();
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
  const localhostHostname = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "::1"
    || url.hostname === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  const isLocalHttpOrigin = process.env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && localhostHostname;
  const isHttpsPublicOrigin = url.protocol === "https:"
    && validHostname.test(url.hostname);

  if (
    !(isLocalHttpOrigin || isHttpsPublicOrigin)
    || url.username
    || url.password
    || (!isLocalHttpOrigin && url.port)
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
