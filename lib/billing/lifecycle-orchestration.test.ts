import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  changeBillingPlanWithDeps,
  type ActiveSubscriptionRow,
  type PlanChangeDeps,
} from "./change-orchestrator";
import {
  BillingRefundError,
  refundFirstPurchaseWithDeps,
  type RefundDeps,
  type RefundSubscriptionRow,
} from "./refund-orchestrator";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const USER_ID = "user_123";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    livemode: false,
    customer: "cus_123",
    metadata: { user_id: USER_ID, plan_code: "core", billing_cadence: "monthly" },
    schedule: null,
    status: "active",
    items: {
      data: [{
        id: "si_123",
        price: { id: "price_core" },
        quantity: 1,
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_592_000,
      }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

const ACTIVE_ROW: ActiveSubscriptionRow = {
  stripe_subscription_id: "sub_123",
  stripe_customer_id: "cus_123",
  pending_plan_code: null,
  stripe_schedule_id: null,
};

function changeDeps(overrides: Partial<PlanChangeDeps> = {}): PlanChangeDeps {
  return {
    livemode: false,
    now: () => NOW,
    activeSubscription: async () => ACTIVE_ROW,
    retrieveSubscription: async () => subscription(),
    planForSubscription: (value) => value.metadata.plan_code === "max" ? "max" : "core",
    cadenceForSubscription: (value) => value.metadata.billing_cadence === "three_month" ? "three_month" : "monthly",
    releaseSchedule: async (value) => value,
    resolvePrice: async (plan, cadence) => `price_${plan}_${cadence}`,
    updateSubscription: async (id, params) => subscription({ id, metadata: params.metadata }),
    clearPending: async () => undefined,
    syncSubscription: async () => undefined,
    offer: (plan, cadence) => ({
      plan,
      cadence,
      amount: plan === "max" ? 8_000 : 5_000,
      intervalCount: cadence === "three_month" ? 3 : 1,
      label: "offer",
    }),
    countSchedules: async () => 2,
    createSchedule: async () => ({ id: "sub_sched_123" }),
    updateSchedule: async () => undefined,
    savePending: async () => undefined,
    ...overrides,
  };
}

test("plan changes reject Stripe mode, customer, and account identity mismatches before mutation", async () => {
  for (const wrong of [
    subscription({ livemode: true }),
    subscription({ customer: "cus_attacker" }),
    subscription({ metadata: { user_id: "user_attacker", plan_code: "core" } }),
  ]) {
    let mutations = 0;
    const deps = changeDeps({
      retrieveSubscription: async () => wrong,
      updateSubscription: async () => {
        mutations += 1;
        return wrong;
      },
      createSchedule: async () => {
        mutations += 1;
        return { id: "bad" };
      },
    });
    await assert.rejects(changeBillingPlanWithDeps(deps, USER_ID, "max", "monthly"), /Stripe|billing|Blueprint/);
    assert.equal(mutations, 0);
  }
});

test("immediate upgrades use a stable idempotency key and persist only after Stripe succeeds", async () => {
  const order: string[] = [];
  let updateCall: [string, Stripe.SubscriptionUpdateParams, string] | null = null;
  const deps = changeDeps({
    updateSubscription: async (id, params, key) => {
      order.push("stripe-update");
      updateCall = [id, params, key];
      return subscription({ metadata: params.metadata });
    },
    clearPending: async () => { order.push("clear"); },
    syncSubscription: async () => { order.push("sync"); },
  });
  const result = await changeBillingPlanWithDeps(deps, USER_ID, "max", "monthly");
  assert.deepEqual(result, { kind: "upgrade", plan: "max", effectiveAt: null });
  assert.deepEqual(order, ["stripe-update", "clear", "sync"]);
  assert.ok(updateCall);
  const [, params, key] = updateCall as unknown as [string, Stripe.SubscriptionUpdateParams, string];
  assert.equal(key, "blueprint-upgrade-sub_123-1802592000-max-monthly");
  assert.equal(params.payment_behavior, "error_if_incomplete");
  assert.equal((params.metadata as Stripe.MetadataParam).user_id, USER_ID);
});

test("a failed Stripe upgrade cannot clear or sync local subscription state", async () => {
  let localWrites = 0;
  const deps = changeDeps({
    updateSubscription: async () => { throw new Error("stripe unavailable"); },
    clearPending: async () => { localWrites += 1; },
    syncSubscription: async () => { localWrites += 1; },
  });
  await assert.rejects(changeBillingPlanWithDeps(deps, USER_ID, "max", "monthly"), /stripe unavailable/);
  assert.equal(localWrites, 0);
});

test("scheduled downgrades carry ownership metadata and expose partial DB-save failures", async () => {
  const order: string[] = [];
  let scheduleKey = "";
  let savedCadence = "";
  const deps = changeDeps({
    retrieveSubscription: async () => subscription({
      metadata: { user_id: USER_ID, plan_code: "max", billing_cadence: "monthly" },
    }),
    createSchedule: async (_id, key) => {
      order.push("create");
      scheduleKey = key;
      return { id: "sub_sched_123" };
    },
    updateSchedule: async (_id, params) => {
      const metadata = params.metadata as Stripe.MetadataParam;
      order.push(`update:${metadata.user_id}:${metadata.target_plan}`);
    },
    savePending: async (_id, input) => {
      order.push("save");
      savedCadence = input.cadence;
      throw new Error("database unavailable");
    },
  });
  await assert.rejects(changeBillingPlanWithDeps(deps, USER_ID, "core", "monthly"), /database unavailable/);
  assert.equal(scheduleKey, "blueprint-downgrade-schedule-sub_123-1802592000-core-monthly-3");
  assert.equal(savedCadence, "monthly");
  assert.deepEqual(order, ["create", `update:${USER_ID}:core`, "save"]);
});

const REFUND_ROW: RefundSubscriptionRow = {
  id: "subscription_row_1",
  user_id: USER_ID,
  stripe_subscription_id: "sub_123",
  stripe_customer_id: "cus_123",
  stripe_created_at: "2026-08-28T10:00:00.000Z",
  refundable_until: "2026-08-29T10:00:00.000Z",
  refunded_at: null,
  stripe_refund_id: null,
};

function stripeRefund(id: string, amount: number): Stripe.Refund {
  return { id, amount, currency: "usd", status: "succeeded" } as Stripe.Refund;
}

function refundDeps(overrides: Partial<RefundDeps> = {}): RefundDeps {
  return {
    livemode: false,
    now: () => NOW,
    findUser: async () => ({ id: USER_ID }),
    listPurchases: async () => [REFUND_ROW],
    claimRequest: async () => ({
      id: "refund_request_1",
      status: "processing",
      stripe_refund_ids: [],
      amount: null,
      currency: null,
    }),
    retrieveSubscription: async () => subscription(),
    listPayments: async () => [{
      id: "ip_1",
      paymentIntentId: "pi_1",
      chargeId: "ch_1",
      amount: 5_000,
      currency: "usd",
    }],
    createRefund: async () => stripeRefund("re_1", 5_000),
    saveRefunds: async () => undefined,
    cancelSubscription: async (value) => subscription({ ...value, status: "canceled" }),
    syncSubscription: async () => undefined,
    markSubscriptionRefunded: async () => undefined,
    failRequest: async () => undefined,
    ...overrides,
  };
}

test("refund eligibility rejects an expired window before claiming or calling Stripe", async () => {
  let externalCalls = 0;
  const deps = refundDeps({
    listPurchases: async () => [{ ...REFUND_ROW, refundable_until: "2026-08-28T11:59:59.999Z" }],
    claimRequest: async () => {
      externalCalls += 1;
      throw new Error("must not claim");
    },
    retrieveSubscription: async () => {
      externalCalls += 1;
      return subscription();
    },
  });
  await assert.rejects(
    refundFirstPurchaseWithDeps(deps, " Student@Example.com ", "admin@example.com"),
    (error) => error instanceof BillingRefundError && error.code === "window",
  );
  assert.equal(externalCalls, 0);
});

test("refunds reject mode, customer, and account identity mismatches before payment lookup", async () => {
  for (const wrong of [
    subscription({ livemode: true }),
    subscription({ customer: "cus_attacker" }),
    subscription({ metadata: { user_id: "user_attacker" } }),
  ]) {
    let paymentCalls = 0;
    const deps = refundDeps({
      retrieveSubscription: async () => wrong,
      listPayments: async () => {
        paymentCalls += 1;
        return [];
      },
    });
    await assert.rejects(refundFirstPurchaseWithDeps(deps, "student@example.com", "admin@example.com"));
    assert.equal(paymentCalls, 0);
  }
});

test("refunds sum Stripe amounts and use payment-stable idempotency before canceling access", async () => {
  const keys: string[] = [];
  const order: string[] = [];
  let savedAmount = 0;
  const deps = refundDeps({
    listPayments: async () => [
      { id: "ip_1", paymentIntentId: "pi_1", chargeId: null, amount: 5_000, currency: "usd" },
      { id: "ip_2", paymentIntentId: null, chargeId: "ch_2", amount: 1_200, currency: "usd" },
    ],
    createRefund: async (payment, metadata, key) => {
      order.push(`refund:${payment.id}:${metadata.user_id}`);
      keys.push(key);
      return stripeRefund(`re_${payment.id}`, payment.amount);
    },
    saveRefunds: async (_id, input) => {
      order.push("save-refunds");
      savedAmount = input.amount;
    },
    cancelSubscription: async (value) => {
      order.push("cancel");
      return value;
    },
    syncSubscription: async () => { order.push("sync"); },
    markSubscriptionRefunded: async () => { order.push("mark"); },
  });
  const result = await refundFirstPurchaseWithDeps(deps, "student@example.com", "admin@example.com");
  assert.deepEqual(result, { refundIds: ["re_ip_1", "re_ip_2"], amount: 6_200, currency: "usd" });
  assert.equal(savedAmount, 6_200);
  assert.deepEqual(keys, ["blueprint-refund-sub_123-ip_1", "blueprint-refund-sub_123-ip_2"]);
  assert.deepEqual(order, [
    `refund:ip_1:${USER_ID}`,
    `refund:ip_2:${USER_ID}`,
    "save-refunds",
    "cancel",
    "sync",
    "mark",
  ]);
});

test("a succeeded refund request returns the original amount without another Stripe call", async () => {
  let stripeCalls = 0;
  const deps = refundDeps({
    claimRequest: async () => ({
      id: "refund_request_1",
      status: "succeeded",
      stripe_refund_ids: ["re_existing"],
      amount: 5_000,
      currency: "cad",
    }),
    retrieveSubscription: async () => {
      stripeCalls += 1;
      return subscription();
    },
  });
  assert.deepEqual(
    await refundFirstPurchaseWithDeps(deps, "student@example.com", "admin@example.com"),
    { refundIds: ["re_existing"], amount: 5_000, currency: "cad" },
  );
  assert.equal(stripeCalls, 0);
});

test("Stripe refund failure records attention state and never cancels the subscription", async () => {
  const order: string[] = [];
  const deps = refundDeps({
    createRefund: async () => {
      order.push("refund");
      throw new Error("Stripe refund failed");
    },
    cancelSubscription: async (value) => {
      order.push("cancel");
      return value;
    },
    failRequest: async (_id, message) => { order.push(`fail:${message}`); },
  });
  await assert.rejects(
    refundFirstPurchaseWithDeps(deps, "student@example.com", "admin@example.com"),
    /Stripe refund failed/,
  );
  assert.deepEqual(order, ["refund", "fail:Stripe refund failed"]);
});

test("post-refund cancellation failure preserves the saved refund and flags partial state", async () => {
  const order: string[] = [];
  const deps = refundDeps({
    saveRefunds: async () => { order.push("saved"); },
    cancelSubscription: async () => {
      order.push("cancel");
      throw new Error("cancel failed");
    },
    markSubscriptionRefunded: async () => { order.push("marked"); },
    failRequest: async () => { order.push("needs-attention"); },
  });
  await assert.rejects(
    refundFirstPurchaseWithDeps(deps, "student@example.com", "admin@example.com"),
    /cancel failed/,
  );
  assert.deepEqual(order, ["saved", "cancel", "needs-attention"]);
});
