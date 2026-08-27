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
