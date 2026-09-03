import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLIMENTARY_ACCESS_PLAN,
  hasComplimentaryAccess,
  type ComplimentaryAccessDependencies,
} from "./users";

function deps(
  account: { id: string; plan: string | null; account_status: string } | null,
  grant = false,
): ComplimentaryAccessDependencies {
  return {
    loadAccount: async () => account,
    hasActiveGrant: async () => grant,
  };
}

const comped = { id: "u1", plan: null, account_status: "active" };

// The reported failure: a student comped through the students panel got the
// entitlement but never received a login email. The panel writes an
// access_grants row and leaves users.plan alone, and this gate only read
// users.plan -- so the request route fell through to Stripe, found no
// subscription, and sent nothing. The generic response hid it.
test("an active admin grant is enough to sign in", async () => {
  assert.equal(await hasComplimentaryAccess("student@example.com", deps(comped, true)), true);
});

test("the legacy users.plan route still works", async () => {
  const legacy = { id: "u1", plan: COMPLIMENTARY_ACCESS_PLAN, account_status: "active" };
  assert.equal(await hasComplimentaryAccess("student@example.com", deps(legacy, false)), true);
});

test("no grant and no complimentary plan is not complimentary access", async () => {
  assert.equal(await hasComplimentaryAccess("student@example.com", deps(comped, false)), false);
});

test("a suspended account is refused on either route", async () => {
  const suspended = { id: "u1", plan: COMPLIMENTARY_ACCESS_PLAN, account_status: "suspended" };
  assert.equal(await hasComplimentaryAccess("student@example.com", deps(suspended, true)), false);
  assert.equal(await hasComplimentaryAccess("student@example.com", deps({ ...comped, account_status: "suspended" }, true)), false);
});

test("an unknown account, or an unusable address, is refused without a lookup", async () => {
  assert.equal(await hasComplimentaryAccess("student@example.com", deps(null, true)), false);
  let looked = false;
  await hasComplimentaryAccess("not-an-email", {
    loadAccount: async () => { looked = true; return comped; },
    hasActiveGrant: async () => true,
  });
  assert.equal(looked, false, "a malformed address must not reach the database");
});
