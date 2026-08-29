import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidEmail,
  passwordSignupAttemptLimit,
  safeNextPath,
  validatePassword,
} from "./password";

test("password validation requires length, a letter, and a number", () => {
  assert.equal(validatePassword("short1").valid, false);
  assert.equal(validatePassword("abcdefghij").valid, false);
  assert.equal(validatePassword("1234567890").valid, false);
  assert.equal(validatePassword(`Blueprint1${"x".repeat(128)}`).valid, false);
  assert.deepEqual(validatePassword("blueprint1500"), { valid: true });
});

test("email validation rejects malformed values", () => {
  assert.equal(isValidEmail("student@example.com"), true);
  assert.equal(isValidEmail("student@example"), false);
  assert.equal(isValidEmail("student example.com"), false);
});

test("preview QA has a larger signup budget without weakening production", () => {
  assert.equal(passwordSignupAttemptLimit("preview"), 50);
  assert.equal(passwordSignupAttemptLimit("production"), 3);
  assert.equal(passwordSignupAttemptLimit(undefined), 3);
});

test("next paths cannot leave the application", () => {
  assert.equal(safeNextPath(null), "/ultimate");
  assert.equal(safeNextPath("/ultimate/planner"), "/ultimate/planner");
  assert.equal(safeNextPath("https://attacker.example"), "/ultimate");
  assert.equal(safeNextPath("//attacker.example"), "/ultimate");
  assert.equal(safeNextPath("/\\attacker.example"), "/ultimate");
});
