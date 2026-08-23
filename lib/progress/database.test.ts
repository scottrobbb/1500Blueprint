import assert from "node:assert/strict";
import test from "node:test";
import { isMissingModuleSnapshotColumnError, isMissingTestSnapshotColumnError } from "./database";

test("recognizes only missing immutable-test columns", () => {
  assert.equal(isMissingTestSnapshotColumnError({ code: "42703", message: "column test_attempts.test_title does not exist" }), true);
  assert.equal(isMissingTestSnapshotColumnError({ code: "PGRST204", message: "Could not find the 'test_snapshot' column" }), true);
  assert.equal(isMissingTestSnapshotColumnError({ code: "42703", message: "column completed_at does not exist" }), false);
  assert.equal(isMissingTestSnapshotColumnError({ code: "42501", message: "permission denied for test_title" }), false);
});

test("recognizes only the missing immutable module snapshot column", () => {
  assert.equal(isMissingModuleSnapshotColumnError({ code: "42703", message: "column module_attempts.module_snapshot does not exist" }), true);
  assert.equal(isMissingModuleSnapshotColumnError({ code: "PGRST204", message: "Could not find the 'module_snapshot' column" }), true);
  assert.equal(isMissingModuleSnapshotColumnError({ code: "42703", message: "column module_attempts.answers does not exist" }), false);
  assert.equal(isMissingModuleSnapshotColumnError({ code: "08006", message: "connection failed" }), false);
});
