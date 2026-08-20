import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidEmail,
  safeNextPath,
  validatePassword,
} from "./password";

test("password validation requires length, a letter, and a number", () => {
  assert.equal(validatePassword("short1").valid, false);
  assert.equal(validatePassword("abcdefghij").valid, false);
  assert.equal(validatePassword("1234567890").valid, false);
  assert.deepEqual(validatePassword("blueprint1500"), { valid: true });
});

test("email validation rejects malformed values", () => {
  assert.equal(isValidEmail("student@example.com"), true);
  assert.equal(isValidEmail("student@example"), false);
  assert.equal(isValidEmail("student example.com"), false);
});

test("next paths cannot leave the application", () => {
  assert.equal(safeNextPath("/ultimate/planner"), "/ultimate/planner");
  assert.equal(safeNextPath("https://attacker.example"), "/drills");
  assert.equal(safeNextPath("//attacker.example"), "/drills");
  assert.equal(safeNextPath("/\\attacker.example"), "/drills");
});
