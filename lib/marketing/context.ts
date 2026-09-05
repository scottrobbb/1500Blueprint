import "server-only";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { allowedAppOrigins, canonicalAppUrl } from "@/lib/auth/config";
import { clientAddressFromHeaders } from "@/lib/security/request";
import { FREE_ATTRIBUTION_COOKIE, parseAttributionCookie } from "./attribution";
import type { ConversionContext } from "./conversions";

export async function conversionContext(fallbackPath: string): Promise<ConversionContext> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const raw = cookieStore.get(FREE_ATTRIBUTION_COOKIE)?.value;
  const attribution = parseAttributionCookie(raw);
  const parameters = new URLSearchParams(raw ?? "");
  const address = clientAddressFromHeaders(requestHeaders);
  const fbp = cookieStore.get("_fbp")?.value ?? "";
  let sourceUrl = `${canonicalAppUrl()}${fallbackPath}`;
  try {
    const referrer = new URL(requestHeaders.get("referer") ?? "");
    if (allowedAppOrigins().has(referrer.origin)) sourceUrl = `${referrer.origin}${referrer.pathname}`;
  } catch { /* Missing referrers use the known application route. */ }
  return {
    fbclid: attribution?.fbclid ?? null,
    fbc: attribution?.fbc ?? null,
    utm_medium: attribution?.utm_medium ?? null,
    fbp: /^fb\.\d\.\d{10,16}\.\d{1,30}$/.test(fbp) ? fbp : null,
    landing_page: parameters.get("landing_page")?.slice(0, 200) ?? (attribution ? "/free" : null),
    event_source_url: sourceUrl,
    client_ip_address: isIP(address) ? address : null,
    client_user_agent: requestHeaders.get("user-agent")?.slice(0, 1000) ?? null,
  };
}
