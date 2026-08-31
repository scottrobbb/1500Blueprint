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
        items: { data: [{ price: { id: "price_starter", nickname: "Starter", product: null } }] },
      }];
    },
  };

  // "Starter" names no tier, so it resolves to the configured fallback rather
  // than being stored verbatim -- storing it used to read back as "free".
  assert.deepEqual(
    await getMembership("kieran.kumbhar09@gmail.com", dependencies),
    { active: true, plan: "max" },
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
        items: { data: [{ price: { id: "price_starter", nickname: "Starter", product: null } }] },
      }];
    },
  };

  assert.deepEqual(
    await getMembership("kieran.kumbhar09@gmail.com", dependencies),
    { active: false, plan: null },
  );
});

function membershipFor(price: { id: string; nickname: string | null; product: string | null }): MembershipDependencies {
  return {
    listCustomers: async () => ({ data: [{ id: "cus_1", email: "member@example.com" }], hasMore: false }),
    listSubscriptions: async () => [{ status: "active", items: { data: [{ price }] } }],
  };
}

test("an active subscription always resolves to a plan code, never a Stripe display value", async (t) => {
  const original = {
    maxPrice: process.env.STRIPE_MAX_PRICE_ID,
    legacyCore: process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS,
    fallback: process.env.STRIPE_LEGACY_FALLBACK_PLAN,
  };
  process.env.STRIPE_MAX_PRICE_ID = "price_max_current";
  process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS = "prod_old_core";
  delete process.env.STRIPE_LEGACY_FALLBACK_PLAN;
  t.after(() => {
    restore("STRIPE_MAX_PRICE_ID", original.maxPrice);
    restore("STRIPE_LEGACY_CORE_PRODUCT_IDS", original.legacyCore);
    restore("STRIPE_LEGACY_FALLBACK_PLAN", original.fallback);
  });

  // A configured price wins outright.
  assert.deepEqual(
    await getMembership("member@example.com", membershipFor({ id: "price_max_current", nickname: null, product: "prod_x" })),
    { active: true, plan: "max" },
  );

  // Otherwise a known legacy product decides it.
  assert.deepEqual(
    await getMembership("member@example.com", membershipFor({ id: "price_unknown", nickname: null, product: "prod_old_core" })),
    { active: true, plan: "core" },
  );

  // A nickname that names its tier is still trustworthy.
  assert.deepEqual(
    await getMembership("member@example.com", membershipFor({ id: "price_unknown", nickname: "Blueprint Max Annual", product: null })),
    { active: true, plan: "max" },
  );

  // This is the regression: an unmappable price with no usable nickname. It
  // used to be stored raw and read back as "free", silently dropping a paying
  // member to the free tier. It must resolve to a paid plan instead.
  assert.deepEqual(
    await getMembership("member@example.com", membershipFor({ id: "price_1UAJFJAPf1YLQmcsEmv3N2W0", nickname: null, product: null })),
    { active: true, plan: "max" },
  );
});

test("the unresolved fallback plan is configurable", async (t) => {
  const original = process.env.STRIPE_LEGACY_FALLBACK_PLAN;
  process.env.STRIPE_LEGACY_FALLBACK_PLAN = "core";
  t.after(() => restore("STRIPE_LEGACY_FALLBACK_PLAN", original));

  assert.deepEqual(
    await getMembership("member@example.com", membershipFor({ id: "price_unknown", nickname: null, product: null })),
    { active: true, plan: "core" },
  );
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
