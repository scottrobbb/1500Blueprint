import assert from "node:assert/strict";
import test from "node:test";
import {
  byteLength,
  clientAddress,
  contentLengthExceeds,
  hasImageSignature,
  isSameOriginRequest,
  normalizeEmailInput,
  normalizeHttpUrl,
  readJsonBody,
  readTextBody,
  readUrlEncodedForm,
  RequestBodyTooLargeError,
} from "./request";

test("contentLengthExceeds rejects oversized and malformed lengths", () => {
  assert.equal(contentLengthExceeds(new Request("https://example.com", { headers: { "content-length": "10" } }), 10), false);
  assert.equal(contentLengthExceeds(new Request("https://example.com", { headers: { "content-length": "11" } }), 10), true);
  assert.equal(contentLengthExceeds(new Request("https://example.com", { headers: { "content-length": "not-a-number" } }), 10), true);
  assert.equal(contentLengthExceeds(new Request("https://example.com"), 10), false);
});

test("normalizeEmailInput canonicalizes plausible addresses and bounds hostile input", () => {
  assert.equal(normalizeEmailInput("  Dawson@Example.COM "), "dawson@example.com");
  assert.equal(normalizeEmailInput("missing-domain@example"), null);
  assert.equal(normalizeEmailInput(`a@${"b".repeat(250)}.com`), null);
  assert.equal(normalizeEmailInput("a\n@example.com"), null);
});

test("normalizeHttpUrl accepts only bounded HTTP URLs without credentials", () => {
  assert.equal(normalizeHttpUrl("https://user:secret@example.com/image.png"), "https://example.com/image.png");
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(normalizeHttpUrl(`https://example.com/${"x".repeat(2048)}`), null);
});

test("isSameOriginRequest blocks cross-site browser mutations", () => {
  assert.equal(isSameOriginRequest(new Request("https://example.com/api", {
    headers: { origin: "https://example.com" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("https://example.com/api", {
    headers: { origin: "https://attacker.example" },
  })), false);
  assert.equal(isSameOriginRequest(new Request("https://example.com/api", {
    headers: { "sec-fetch-site": "cross-site" },
  })), false);
  assert.equal(isSameOriginRequest(new Request("https://example.com/api")), true);
});

test("clientAddress prefers platform-provided headers and rejects suspicious values", () => {
  assert.equal(clientAddress(new Request("https://example.com", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1",
      "x-forwarded-for": "198.51.100.9",
    },
  })), "203.0.113.5");
  assert.equal(clientAddress(new Request("https://example.com", {
    headers: { "x-forwarded-for": "not an address" },
  })), "unknown");
});

test("byteLength measures UTF-8 bytes", () => {
  assert.equal(byteLength("abc"), 3);
  assert.equal(byteLength("é"), 2);
});

test("bounded body readers enforce actual streamed bytes without content-length", async () => {
  const request = new Request("https://example.com", { method: "POST", body: "éé" });
  assert.equal(await readTextBody(request, 4), "éé");
  await assert.rejects(
    readTextBody(new Request("https://example.com", { method: "POST", body: "12345" }), 4),
    RequestBodyTooLargeError,
  );
  assert.deepEqual(
    await readJsonBody(new Request("https://example.com", { method: "POST", body: '{"ok":true}' }), 32),
    { ok: true },
  );
});

test("readUrlEncodedForm accepts bounded native HTML forms only", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "plan=core&cadence=monthly",
  });
  assert.equal((await readUrlEncodedForm(request, 64)).get("plan"), "core");
  await assert.rejects(readUrlEncodedForm(new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), 64), TypeError);
});

test("hasImageSignature verifies supported raster formats", () => {
  assert.equal(hasImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(hasImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(hasImageSignature(new TextEncoder().encode("GIF89a"), "image/gif"), true);
  assert.equal(hasImageSignature(new TextEncoder().encode("RIFF1234WEBP"), "image/webp"), true);
  assert.equal(hasImageSignature(new TextEncoder().encode("<svg></svg>"), "image/png"), false);
  assert.equal(hasImageSignature(new TextEncoder().encode("GIF89a"), "image/svg+xml"), false);
});
