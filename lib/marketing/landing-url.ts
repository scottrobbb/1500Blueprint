import { deflateRawSync, inflateRawSync } from "node:zlib";
import { UTM_KEYS } from "./attribution";

export const LANDING_URL_COOKIE = "bp_landing_url";
const PREFIX = "v1.";
const UNAVAILABLE = "unavailable";
const MAX_URL_BYTES = 16_384;
const MAX_COOKIE_LENGTH = 3_500;
const LANDING_PATHS = new Set(["/", "/free", "/max", "/pricing", "/checkout", "/account", "/login", "/account/sign-up", "/account/login"]);
const SECRET_KEY = /^(?:code|token|token_hash|access_token|refresh_token|id_token|auth_token|authorization|password|confirmPassword|client_secret|api_key|secret|session_id|x-vercel-protection-bypass|_vercel_share|_rsc)$/i;
const NESTED_SECRET = /(?:^|[?&#])(?:code|token|token_hash|access_token|refresh_token|id_token|password|client_secret|api_key|secret)=/i;

function safeLandingUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (!LANDING_PATHS.has(url.pathname.replace(/\/$/, "") || "/")) return null;
    // Fragments are not part of HTTP requests. Auth/link credentials must not
    // become marketing data, including credentials inside a redirect parameter.
    url.hash = "";
    for (const [key, parameter] of [...url.searchParams]) {
      if (SECRET_KEY.test(key) || NESTED_SECRET.test(parameter)) url.searchParams.delete(key);
    }
    return url;
  } catch { return null; }
}

export function readLandingUrlCookie(cookie: string | null | undefined): string | null {
  // An empty value deliberately clears an older persisted URL when an incoming
  // URL cannot fit. Missing cookies remain null, preserving cross-device context.
  if (cookie === UNAVAILABLE) return "";
  if (!cookie?.startsWith(PREFIX) || cookie.length > MAX_COOKIE_LENGTH) return null;
  try {
    const decoded = inflateRawSync(Buffer.from(cookie.slice(PREFIX.length), "base64url"), { maxOutputLength: MAX_URL_BYTES }).toString("utf8");
    return safeLandingUrl(decoded)?.href ?? null;
  } catch { return null; }
}

// Returns a new cookie only for the first observed landing or a new tagged
// arrival. Signup, checkout, reloads and internal navigation keep the original.
export function landingUrlCookieUpdate(requestUrl: string, method: string, existingCookie: string | undefined): string | null {
  if (method !== "GET") return null;
  const incoming = safeLandingUrl(requestUrl);
  if (!incoming) return null;
  const previousValue = readLandingUrlCookie(existingCookie);
  const previous = previousValue ? new URL(previousValue) : null;
  const newCampaign = ["fbclid", ...UTM_KEYS].some((key) => {
    const value = incoming.searchParams.get(key);
    return Boolean(value && value !== previous?.searchParams.get(key));
  });
  if (previous && !newCampaign) return null;
  if (previous?.href === incoming.href) return null;
  if (existingCookie === UNAVAILABLE && !newCampaign) return null;
  if (Buffer.byteLength(incoming.href, "utf8") > MAX_URL_BYTES) return UNAVAILABLE;

  // A separate compressed cookie avoids duplicating long fbclid/UTM values
  // inside the existing attribution cookie or silently truncating the URL.
  const encoded = PREFIX + deflateRawSync(incoming.href).toString("base64url");
  return encoded.length <= MAX_COOKIE_LENGTH ? encoded : UNAVAILABLE;
}
