import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPublication,
  isMissingPublicationStatusColumn,
  isPublicationStatus,
  legacyPublicationStatus,
} from "./flags";

test("publication status validation rejects arbitrary values", () => {
  assert.equal(isPublicationStatus("draft"), true);
  assert.equal(isPublicationStatus("published"), true);
  assert.equal(isPublicationStatus("under-construction"), false);
  assert.equal(isPublicationStatus(null), false);
});

test("published content is student-visible while admins can QA drafts", () => {
  assert.equal(canAccessPublication("published", false), true);
  assert.equal(canAccessPublication("published", true), true);
  assert.equal(canAccessPublication("draft", false), false);
  assert.equal(canAccessPublication("draft", true), true);
});

test("legacy rollout fallback preserves the prior availability", () => {
  assert.equal(legacyPublicationStatus("drill", "targeted-math"), "draft");
  assert.equal(legacyPublicationStatus("drill", "grammar"), "published");
  assert.equal(legacyPublicationStatus("test", "practice-test-4"), "draft");
  assert.equal(legacyPublicationStatus("test", "practice-test-7"), "published");
});

test("only a missing status column enables the rollout fallback", () => {
  assert.equal(isMissingPublicationStatusColumn({ code: "42703", message: "column tests.status does not exist" }), true);
  assert.equal(isMissingPublicationStatusColumn({ code: "PGRST204", message: "Could not find the 'status' column" }), true);
  assert.equal(isMissingPublicationStatusColumn({ code: "08006", message: "connection failed" }), false);
  assert.equal(isMissingPublicationStatusColumn({ code: "42703", message: "another column is missing" }), false);
});
