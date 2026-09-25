// Landing attribution survives navigation until registration or checkout.

export const FREE_ATTRIBUTION_COOKIE = "bp_free_attr";
export const FREE_ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

// A real fbclid is around 100 characters. Anything past these ceilings is not
// a click id, and it is dropped rather than truncated -- a truncated id sent to
// Meta is a wrong id, which is worse than none.
const MAX_FBCLID_LENGTH = 255;
const MAX_UTM_MEDIUM_LENGTH = 64;
const MAX_UTM_LENGTH = 256;
const MAX_FBC_LENGTH = 300;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
// fb.<subdomain index>.<click time in ms>.<fbclid>, the format Meta's own
// pixel writes into the _fbc cookie.
const FBC_PREFIX = /^fb\.1\.(\d{1,20})\.(.*)$/;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmAttribution = Record<(typeof UTM_KEYS)[number], string | null>;
export const EMPTY_UTMS: UtmAttribution = {
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
};

export type FreeAttribution = UtmAttribution & {
  fbclid: string | null;
  // Meta's _fbc value, built from the click id and the time it landed. Derived,
  // never supplied by the URL, and always consistent with fbclid.
  fbc: string | null;
};

export function hasAttributionParams(params: URLSearchParams): boolean {
  return params.has("fbclid") || UTM_KEYS.some((key) => params.has(key));
}

export function readUtmParams(params: URLSearchParams): UtmAttribution {
  const attribution = { ...EMPTY_UTMS };
  for (const key of UTM_KEYS) {
    const value = cleanValue(params.get(key), key === "utm_medium" ? MAX_UTM_MEDIUM_LENGTH : MAX_UTM_LENGTH);
    // Bound the encoded contribution of each UTM so a Unicode-heavy ad label
    // cannot push the combined attribution cookie beyond browser limits.
    attribution[key] = value && new URLSearchParams({ v: value }).toString().length <= 402 ? value : null;
  }
  return attribution;
}

export function formatFbc(clickTimeMs: number, fbclid: string): string {
  return `fb.1.${clickTimeMs}.${fbclid}`;
}

// `nowMs` is the moment the click landed. It is stamped once, here, and then
// carried unchanged for the life of the cookie: Meta reads it as the click
// time, so regenerating it later would report the registration as the click.
export function readAttributionParams(params: URLSearchParams, nowMs: number): FreeAttribution {
  const fbclid = cleanValue(params.get("fbclid"), MAX_FBCLID_LENGTH);
  return {
    ...readUtmParams(params),
    fbclid,
    fbc: fbclid ? formatFbc(nowMs, fbclid) : null,
  };
}

// The cookie holds a percent-encoded query string rather than JSON so every
// character it can contain is a legal cookie octet, whether or not the runtime
// encodes the value on the way out.
export function parseAttributionCookie(value: string | null | undefined): FreeAttribution | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const fbclid = cleanValue(params.get("fbclid"), MAX_FBCLID_LENGTH);
  return {
    ...readUtmParams(params),
    fbclid,
    fbc: readFbc(params.get("fbc"), fbclid),
  };
}

export function serializeAttribution(attribution: FreeAttribution): string {
  // src is always present, so a landing that carried no parameters still
  // writes a non-empty cookie and is still recognized as a /free arrival.
  const params = new URLSearchParams({ src: "free" });
  if (attribution.fbclid) params.set("fbclid", attribution.fbclid);
  if (attribution.fbc) params.set("fbc", attribution.fbc);
  for (const key of UTM_KEYS) if (attribution[key]) params.set(key, attribution[key]);
  return params.toString();
}

// Merges field by field, last non-empty value wins.
//
// A return trip to /free with no parameters -- a bookmark, a back button, a
// link from elsewhere on the site -- must not erase the click that brought the
// visitor here, so an absent parameter leaves the stored one alone. A fresh
// attributed click does replace the older value, but only for the parameter it
// actually carries.
//
// fbc is the exception to "field by field": it is derived from the click id,
// so it travels with fbclid rather than on its own. A new click mints a new
// fbc at the new click's time, and a preserved click keeps the fbc it was
// stamped with.
//
// `changed` is false when the visit contributes nothing, and the caller then
// leaves the existing cookie untouched.
export function mergeAttribution(
  existing: FreeAttribution | null,
  incoming: FreeAttribution,
  nowMs: number,
): { attribution: FreeAttribution; changed: boolean } {
  if (!existing) return { attribution: incoming, changed: true };

  const attribution: FreeAttribution = {
    ...EMPTY_UTMS,
    fbclid: incoming.fbclid ?? existing.fbclid,
    fbc: incoming.fbclid
      ? incoming.fbc
      // A stored click with no usable fbc -- one captured before fbc existed,
      // or a tampered cookie value -- is stamped now rather than left behind.
      : existing.fbc ?? (existing.fbclid ? formatFbc(nowMs, existing.fbclid) : null),
  };
  for (const key of UTM_KEYS) attribution[key] = incoming[key] ?? existing[key];
  const changed = attribution.fbclid !== existing.fbclid
    || attribution.fbc !== existing.fbc
    || UTM_KEYS.some((key) => attribution[key] !== existing[key]);
  return { attribution, changed };
}

// A stored fbc counts only when it is exactly the value this click id would
// produce, give or take the timestamp. Nothing else can be forged into the
// payload by handing the server a crafted cookie.
function readFbc(value: unknown, fbclid: string | null): string | null {
  if (!fbclid) return null;
  const raw = cleanValue(value, MAX_FBC_LENGTH);
  if (!raw) return null;
  const match = FBC_PREFIX.exec(raw);
  return match && match[2] === fbclid ? raw : null;
}

function cleanValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARACTERS.test(trimmed)) return null;
  return trimmed;
}
