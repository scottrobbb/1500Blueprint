import assert from "node:assert/strict";
import test from "node:test";
import {
  PROFILE_NAME_MAX_LENGTH,
  validateProfileName,
} from "./profile-name";

test("profile names are trimmed and internal whitespace is normalized", () => {
  assert.deepEqual(validateProfileName("  Alex   Morgan  "), {
    valid: true,
    name: "Alex Morgan",
  });
});

test("profile names enforce the supported length", () => {
  assert.equal(validateProfileName("A").valid, false);
  assert.equal(
    validateProfileName("A".repeat(PROFILE_NAME_MAX_LENGTH + 1)).valid,
    false,
  );
  assert.equal(validateProfileName(null).valid, false);
});

test("blocks the crown emoji and the owner's name for ordinary members", () => {
  assert.equal(validateProfileName("Alex \u{1F451}").valid, false);
  assert.equal(validateProfileName("Scott Robinson").valid, false);
  assert.equal(validateProfileName("scott  robinson").valid, false);
  assert.equal(validateProfileName("I love Scott Robinson's course").valid, false);
});

test("allows the reserved name and emoji when explicitly opted in", () => {
  assert.deepEqual(
    validateProfileName("Scott Robinson \u{1F451}", { allowReserved: true }),
    { valid: true, name: "Scott Robinson \u{1F451}" },
  );
});
