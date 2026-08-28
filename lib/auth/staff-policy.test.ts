import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveStaffAssignment } from "./staff-policy";

test("staff authorization is revoked when the account is not active", () => {
  assert.equal(hasActiveStaffAssignment(true, "active"), true);
  assert.equal(hasActiveStaffAssignment(true, "suspended"), false);
  assert.equal(hasActiveStaffAssignment(true, "archived"), false);
  assert.equal(hasActiveStaffAssignment(false, "active"), false);
});
