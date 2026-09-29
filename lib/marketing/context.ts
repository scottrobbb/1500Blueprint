import "server-only";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { allowedAppOrigins, canonicalAppUrl } from "@/lib/auth/config";
import { clientAddressFromHeaders } from "@/lib/security/request";
import { FREE_ATTRIBUTION_COOKIE, parseAttributionCookie, readUtmParams } from "./attribution";
import type { ConversionContext } from "./conversions";
import { LANDING_URL_COOKIE, readLandingUrlCookie } from "./landing-url";

export async function conversionContext(fallbackPath: string): Promise<ConversionContext> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const raw = cookieStore.get(FREE_ATTRIBUTION_COOKIE)?.value;
  const attribution = parseAttributionCookie(raw);
  const parameters = new URLSearchParams(raw ?? "");
  const address = clientAddressFromHeaders(requestHeaders);
  const fbp = cookieStore.get("_fbp")?.value ?? "";
  let landingUrl = readLandingUrlCookie(cookieStore.get(LANDING_URL_COOKIE)?.value);
  if (landingUrl && !allowedAppOrigins().has(new URL(landingUrl).origin)) landingUrl = null;
  let sourceUrl = `${canonicalAppUrl()}${fallbackPath}`;
  try {
    const referrer = new URL(requestHeaders.get("referer") ?? "");
    if (allowedAppOrigins().has(referrer.origin)) sourceUrl = `${referrer.origin}${referrer.pathname}`;
  } catch { /* Missing referrers use the known application route. */ }
  return {
    ...readUtmParams(parameters),
    fbclid: attribution?.fbclid ?? null,
    fbc: attribution?.fbc ?? null,
    fbp: /^fb\.\d\.\d{10,16}\.\d{1,30}$/.test(fbp) ? fbp : null,
    landing_page: parameters.get("landing_page")?.slice(0, 200) ?? (attribution ? "/free" : null),
    landing_url: landingUrl,
    event_source_url: sourceUrl,
    client_ip_address: isIP(address) ? address : null,
    client_user_agent: requestHeaders.get("user-agent")?.slice(0, 1000) ?? null,
  };
}
