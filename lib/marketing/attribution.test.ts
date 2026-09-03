import assert from "node:assert/strict";
import test from "node:test";
import {
  formatFbc,
  mergeAttribution,
  parseAttributionCookie,
  readAttributionParams,
  serializeAttribution,
  type FreeAttribution,
} from "./attribution";

const CLICK_MS = 1_756_900_000_000;
const LATER_MS = CLICK_MS + 86_400_000;

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

test("landing parameters are read and trimmed", () => {
  assert.deepEqual(
    readAttributionParams(params("fbclid=%20abc123%20&utm_medium=paid_social"), CLICK_MS),
    {
      fbclid: "abc123",
      fbc: `fb.1.${CLICK_MS}.abc123`,
      utm_medium: "paid_social",
    },
  );
});

test("fbc is built in Meta's format from the click id and the time it landed", () => {
  assert.equal(formatFbc(CLICK_MS, "abc123"), "fb.1.1756900000000.abc123");
});

test("absent, empty, and oversized parameters read as null", () => {
  assert.deepEqual(readAttributionParams(params(""), CLICK_MS), {
    fbclid: null,
    fbc: null,
    utm_medium: null,
  });
  assert.deepEqual(readAttributionParams(params("fbclid=&utm_medium=%20%20"), CLICK_MS), {
    fbclid: null,
    fbc: null,
    utm_medium: null,
  });

  // Dropped, not truncated: a shortened click id is a wrong click id.
  const oversized = readAttributionParams(params(`fbclid=${"a".repeat(256)}`), CLICK_MS);
  assert.equal(oversized.fbclid, null);
  assert.equal(oversized.fbc, null);
});

test("a later visit with no parameters preserves the stored attribution", () => {
  const stored: FreeAttribution = {
    fbclid: "click-1",
    fbc: `fb.1.${CLICK_MS}.click-1`,
    utm_medium: "paid_social",
  };
  const merged = mergeAttribution(stored, readAttributionParams(params(""), LATER_MS), LATER_MS);

  assert.deepEqual(merged.attribution, stored);
  // Nothing to write, so the existing cookie -- and the original click time
  // inside its fbc -- is left exactly as it is.
  assert.equal(merged.changed, false);
});

test("a fresh attributed click replaces an older one, fbc included", () => {
  const merged = mergeAttribution(
    { fbclid: "click-1", fbc: `fb.1.${CLICK_MS}.click-1`, utm_medium: "paid_social" },
    readAttributionParams(params("fbclid=click-2&utm_medium=email"), LATER_MS),
    LATER_MS,
  );

  assert.deepEqual(merged.attribution, {
    fbclid: "click-2",
    fbc: `fb.1.${LATER_MS}.click-2`,
    utm_medium: "email",
  });
  assert.equal(merged.changed, true);
});

test("a partial visit overwrites only the parameter it carries", () => {
  const merged = mergeAttribution(
    { fbclid: "click-1", fbc: `fb.1.${CLICK_MS}.click-1`, utm_medium: "paid_social" },
    readAttributionParams(params("utm_medium=email"), LATER_MS),
    LATER_MS,
  );

  // The click and its fbc move together: neither changed, so the original
  // click time survives.
  assert.deepEqual(merged.attribution, {
    fbclid: "click-1",
    fbc: `fb.1.${CLICK_MS}.click-1`,
    utm_medium: "email",
  });
  assert.equal(merged.changed, true);
});

test("a stored click with no usable fbc is stamped on the next visit", () => {
  const merged = mergeAttribution(
    { fbclid: "click-1", fbc: null, utm_medium: null },
    readAttributionParams(params(""), LATER_MS),
    LATER_MS,
  );

  assert.equal(merged.attribution.fbc, `fb.1.${LATER_MS}.click-1`);
  assert.equal(merged.changed, true);
});

test("a first visit always writes, so a parameterless landing is still recorded", () => {
  const merged = mergeAttribution(null, readAttributionParams(params(""), CLICK_MS), CLICK_MS);

  assert.deepEqual(merged.attribution, { fbclid: null, fbc: null, utm_medium: null });
  assert.equal(merged.changed, true);
  // Non-empty, so the cookie survives the round trip and marks the arrival.
  assert.equal(serializeAttribution(merged.attribution), "src=free");
});

test("attribution round-trips through the cookie value", () => {
  const attribution: FreeAttribution = {
    fbclid: "IwAR0_a-b",
    fbc: `fb.1.${CLICK_MS}.IwAR0_a-b`,
    utm_medium: "paid social",
  };
  const cookie = serializeAttribution(attribution);

  assert.equal(cookie.includes(";"), false);
  assert.equal(cookie.includes(","), false);
  assert.deepEqual(parseAttributionCookie(cookie), attribution);
});

test("an fbc that does not belong to the stored click id is discarded", () => {
  const forged = parseAttributionCookie(
    `src=free&fbclid=click-1&fbc=${encodeURIComponent("fb.1.1756900000000.someone-elses-click")}`,
  );
  assert.equal(forged?.fbclid, "click-1");
  assert.equal(forged?.fbc, null);

  const malformed = parseAttributionCookie("src=free&fbclid=click-1&fbc=not-an-fbc");
  assert.equal(malformed?.fbc, null);

  // An fbc with no click id behind it means nothing.
  const orphaned = parseAttributionCookie(
    `src=free&fbc=${encodeURIComponent("fb.1.1756900000000.click-1")}`,
  );
  assert.equal(orphaned?.fbc, null);
});

test("a missing or unreadable cookie is not a /free arrival", () => {
  assert.equal(parseAttributionCookie(undefined), null);
  assert.equal(parseAttributionCookie(""), null);
});
