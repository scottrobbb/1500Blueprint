import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLegacyBillingMarker,
  hasUntrackedStripeBillingWithDeps,
  type BillingAccount,
} from "./accounts";

test("legacy paid, complimentary, admin, and QA labels require billing reconciliation", () => {
  assert.equal(hasLegacyBillingMarker("Blueprint"), true);
  assert.equal(hasLegacyBillingMarker("max"), true);
  assert.equal(hasLegacyBillingMarker("core"), true);
  assert.equal(hasLegacyBillingMarker("testing"), true);
  assert.equal(hasLegacyBillingMarker("complimentary"), true);
  assert.equal(hasLegacyBillingMarker("admin"), true);
  assert.equal(hasLegacyBillingMarker("dev"), true);
  assert.equal(hasLegacyBillingMarker("free"), false);
  assert.equal(hasLegacyBillingMarker(null), false);
});

test("new accounts pass only when Stripe has no prior customer", async () => {
  const account = billingAccount({ stripeCustomerId: null });
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, false, lookup()), false);
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, false, lookup({
    customers: [{ id: "cus_old", deleted: false, metadata: {} }],
  })), true);
});

test("an owned empty Checkout customer can be reused but legacy and active billing stop checkout", async () => {
  const account = billingAccount();
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, false, lookup({
    customer: {
      id: account.stripeCustomerId!,
      deleted: false,
      metadata: { platform: "1500_blueprint", user_id: account.id },
    },
  })), false);
  assert.equal(await hasUntrackedStripeBillingWithDeps(
    billingAccount({ legacyPlan: "Blueprint" }),
    false,
    lookup(),
  ), true);
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, true, lookup({
    statuses: ["active"],
  })), true);
});

test("tracked canceled billing can resume only with the same owned customer", async () => {
  const account = billingAccount();
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, true, lookup({
    statuses: ["canceled"],
  })), false);
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, false, lookup({
    customer: { id: account.stripeCustomerId!, deleted: false, metadata: {} },
  })), true);
  assert.equal(await hasUntrackedStripeBillingWithDeps(account, true, lookup({
    customers: [
      { id: account.stripeCustomerId!, deleted: false, metadata: {} },
      { id: "cus_duplicate", deleted: false, metadata: {} },
    ],
    statuses: ["canceled"],
  })), true);
});

function billingAccount(overrides: Partial<BillingAccount> = {}): BillingAccount {
  return {
    id: "user_123",
    email: "student@example.com",
    name: "Student",
    legacyPlan: "free",
    status: "active",
    stripeCustomerId: "cus_123",
    ...overrides,
  };
}

function lookup(overrides: {
  customers?: Array<{ id: string; deleted: boolean; metadata: Record<string, string> }>;
  customer?: { id: string; deleted: boolean; metadata: Record<string, string> };
  statuses?: string[];
} = {}) {
  return {
    listCustomersByEmail: async () => overrides.customers ?? [],
    retrieveCustomer: async (customerId: string) => overrides.customer ?? {
      id: customerId,
      deleted: false,
      metadata: { platform: "1500_blueprint", user_id: "user_123" },
    },
    listSubscriptionStatuses: async () => overrides.statuses ?? [],
  };
}
