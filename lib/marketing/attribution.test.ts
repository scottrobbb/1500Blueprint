import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAttribution,
  parseAttributionCookie,
  readAttributionParams,
  serializeAttribution,
  type FreeAttribution,
} from "./attribution";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

test("landing parameters are read and trimmed", () => {
  assert.deepEqual(
    readAttributionParams(params("fbclid=%20abc123%20&utm_medium=paid_social")),
    { fbclid: "abc123", utm_medium: "paid_social" },
  );
});

test("absent, empty, and oversized parameters read as null", () => {
  assert.deepEqual(readAttributionParams(params("")), { fbclid: null, utm_medium: null });
  assert.deepEqual(readAttributionParams(params("fbclid=&utm_medium=%20%20")), {
    fbclid: null,
    utm_medium: null,
  });

  // Dropped, not truncated: a shortened click id is a wrong click id.
  const oversized = readAttributionParams(params(`fbclid=${"a".repeat(256)}`));
  assert.equal(oversized.fbclid, null);
});

test("a later visit with no parameters preserves the stored attribution", () => {
  const stored: FreeAttribution = { fbclid: "click-1", utm_medium: "paid_social" };
  const merged = mergeAttribution(stored, readAttributionParams(params("")));

  assert.deepEqual(merged.attribution, stored);
  // Nothing to write, so the existing cookie is left exactly as it is.
  assert.equal(merged.changed, false);
});

test("a fresh attributed click replaces an older one", () => {
  const merged = mergeAttribution(
    { fbclid: "click-1", utm_medium: "paid_social" },
    readAttributionParams(params("fbclid=click-2&utm_medium=email")),
  );

  assert.deepEqual(merged.attribution, { fbclid: "click-2", utm_medium: "email" });
  assert.equal(merged.changed, true);
});

test("a partial visit overwrites only the parameter it carries", () => {
  const merged = mergeAttribution(
    { fbclid: "click-1", utm_medium: "paid_social" },
    readAttributionParams(params("fbclid=click-2")),
  );

  assert.deepEqual(merged.attribution, { fbclid: "click-2", utm_medium: "paid_social" });
  assert.equal(merged.changed, true);
});

test("a first visit always writes, so a parameterless landing is still recorded", () => {
  const merged = mergeAttribution(null, readAttributionParams(params("")));

  assert.deepEqual(merged.attribution, { fbclid: null, utm_medium: null });
  assert.equal(merged.changed, true);
  // Non-empty, so the cookie survives the round trip and marks the arrival.
  assert.equal(serializeAttribution(merged.attribution), "src=free");
});

test("attribution round-trips through the cookie value", () => {
  const attribution: FreeAttribution = { fbclid: "IwAR0_a+b/c=", utm_medium: "paid social" };
  const cookie = serializeAttribution(attribution);

  assert.equal(cookie.includes(";"), false);
  assert.equal(cookie.includes(","), false);
  assert.deepEqual(parseAttributionCookie(cookie), attribution);
});

test("a missing or unreadable cookie is not a /free arrival", () => {
  assert.equal(parseAttributionCookie(undefined), null);
  assert.equal(parseAttributionCookie(""), null);
});
