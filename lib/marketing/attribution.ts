// Meta ad attribution captured on the /free landing page.
//
// The parameters arrive on the landing URL but are only needed much later, at
// the moment a Free registration completes, so the proxy parks them in a
// cookie. The cookie is written on every /free landing, parameters or not:
// "this visitor came through /free" is itself the gate on whether a completed
// registration counts as a Free-landing conversion.

export const FREE_ATTRIBUTION_COOKIE = "bp_free_attr";
export const FREE_ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

// A real fbclid is around 100 characters. Anything past these ceilings is not
// a click id, and it is dropped rather than truncated -- a truncated id sent to
// Meta is a wrong id, which is worse than none.
const MAX_FBCLID_LENGTH = 255;
const MAX_UTM_MEDIUM_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type FreeAttribution = {
  fbclid: string | null;
  utm_medium: string | null;
};

export function readAttributionParams(params: URLSearchParams): FreeAttribution {
  return {
    fbclid: cleanValue(params.get("fbclid"), MAX_FBCLID_LENGTH),
    utm_medium: cleanValue(params.get("utm_medium"), MAX_UTM_MEDIUM_LENGTH),
  };
}

// The cookie holds a percent-encoded query string rather than JSON so every
// character it can contain is a legal cookie octet, whether or not the runtime
// encodes the value on the way out.
export function parseAttributionCookie(value: string | null | undefined): FreeAttribution | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  return {
    fbclid: cleanValue(params.get("fbclid"), MAX_FBCLID_LENGTH),
    utm_medium: cleanValue(params.get("utm_medium"), MAX_UTM_MEDIUM_LENGTH),
  };
}

export function serializeAttribution(attribution: FreeAttribution): string {
  // src is always present, so a landing that carried no parameters still
  // writes a non-empty cookie and is still recognized as a /free arrival.
  const params = new URLSearchParams({ src: "free" });
  if (attribution.fbclid) params.set("fbclid", attribution.fbclid);
  if (attribution.utm_medium) params.set("utm_medium", attribution.utm_medium);
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
// `changed` is false when the visit contributes nothing, and the caller then
// leaves the existing cookie untouched.
export function mergeAttribution(
  existing: FreeAttribution | null,
  incoming: FreeAttribution,
): { attribution: FreeAttribution; changed: boolean } {
  if (!existing) return { attribution: incoming, changed: true };

  const attribution: FreeAttribution = {
    fbclid: incoming.fbclid ?? existing.fbclid,
    utm_medium: incoming.utm_medium ?? existing.utm_medium,
  };
  const changed = attribution.fbclid !== existing.fbclid
    || attribution.utm_medium !== existing.utm_medium;
  return { attribution, changed };
}

function cleanValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARACTERS.test(trimmed)) return null;
  return trimmed;
}
