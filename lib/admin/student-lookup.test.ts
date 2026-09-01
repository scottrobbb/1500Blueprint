import assert from "node:assert/strict";
import test from "node:test";
import { studentEmailFromParam } from "./student-lookup";

test("decodes an encoded email segment", () => {
  // What encodeURIComponent produces, and what Next hands back unchanged.
  assert.equal(studentEmailFromParam("scotty%40gmail.com"), "scotty@gmail.com");
  assert.equal(studentEmailFromParam("a%2Bb%40x.co"), "a+b@x.co");
});

test("leaves an already-decoded segment alone", () => {
  assert.equal(studentEmailFromParam("scotty@gmail.com"), "scotty@gmail.com");
});

test("normalizes case and surrounding space", () => {
  assert.equal(studentEmailFromParam("%20Scotty%40Gmail.COM%20"), "scotty@gmail.com");
});

test("falls back to the raw segment when the escape is invalid", () => {
  // decodeURIComponent throws on a lone "%"; the address is still usable.
  assert.equal(studentEmailFromParam("od%d@x.co"), "od%d@x.co");
});
