import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_CLAIM_DESTINATION,
  destinationAfterMagicLink,
} from "./rollover";

test("unclaimed magic-link students enter the password rollover", () => {
  assert.equal(
    destinationAfterMagicLink({ passwordAuthEnabled: true, hasPasswordIdentity: false }),
    ACCOUNT_CLAIM_DESTINATION,
  );
});

test("claimed students and legacy-only deployments enter Ultimate", () => {
  assert.equal(
    destinationAfterMagicLink({ passwordAuthEnabled: true, hasPasswordIdentity: true }),
    "/ultimate",
  );
  assert.equal(
    destinationAfterMagicLink({ passwordAuthEnabled: false, hasPasswordIdentity: false }),
    "/ultimate",
  );
});
