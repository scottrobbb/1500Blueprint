import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComplimentaryEmail } from "./users";

test("complimentary access emails are normalized", () => {
  assert.equal(normalizeComplimentaryEmail("  Student+SAT@Example.COM "), "student+sat@example.com");
});

test("invalid complimentary access emails are rejected", () => {
  assert.equal(normalizeComplimentaryEmail("student"), null);
  assert.equal(normalizeComplimentaryEmail("student@@example.com"), null);
  assert.equal(normalizeComplimentaryEmail("student @example.com"), null);
});
