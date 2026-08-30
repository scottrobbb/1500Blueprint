import assert from "node:assert/strict";
import test from "node:test";
import {
  getMembership,
  type MembershipDependencies,
} from "./stripe";

test("legacy membership lookup tolerates Stripe customer email casing", async () => {
  const customerCalls: Array<{ email?: string; startingAfter?: string }> = [];
  const dependencies: MembershipDependencies = {
    listCustomers: async (options) => {
      customerCalls.push({ email: options.email, startingAfter: options.startingAfter });
      if (options.email) return { data: [], hasMore: false };
      return {
        data: [{ id: "cus_legacy", email: "Kieran.Kumbhar09@gmail.com" }],
        hasMore: false,
      };
    },
    listSubscriptions: async (customerId) => {
      assert.equal(customerId, "cus_legacy");
      return [{
        status: "active",
        items: { data: [{ price: { id: "price_starter", nickname: "Starter" } }] },
      }];
    },
  };

  assert.deepEqual(
    await getMembership("kieran.kumbhar09@gmail.com", dependencies),
    { active: true, plan: "Starter" },
  );
  assert.deepEqual(customerCalls, [
    { email: "kieran.kumbhar09@gmail.com", startingAfter: undefined },
    { email: undefined, startingAfter: undefined },
  ]);
});

test("case-insensitive fallback still requires an exact email and active subscription", async () => {
  const dependencies: MembershipDependencies = {
    listCustomers: async (options) => options.email
      ? { data: [], hasMore: false }
      : {
          data: [
            { id: "cus_similar", email: "other-kieran.kumbhar09@gmail.com" },
            { id: "cus_inactive", email: "KIERAN.KUMBHAR09@GMAIL.COM" },
          ],
          hasMore: false,
        },
    listSubscriptions: async (customerId) => {
      assert.equal(customerId, "cus_inactive");
      return [{
        status: "canceled",
        items: { data: [{ price: { id: "price_starter", nickname: "Starter" } }] },
      }];
    },
  };

  assert.deepEqual(
    await getMembership("kieran.kumbhar09@gmail.com", dependencies),
    { active: false, plan: null },
  );
});
