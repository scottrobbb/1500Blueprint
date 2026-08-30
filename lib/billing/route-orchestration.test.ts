import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  createCheckoutPostHandler,
  type CheckoutHandlerDeps,
} from "../../app/api/billing/checkout/handler";
import {
  createCheckoutCancelGetHandler,
  type CheckoutCancelHandlerDeps,
} from "../../app/api/billing/checkout/cancel/handler";
import {
  createCheckoutCancelCurrentPostHandler,
  type CheckoutCancelCurrentHandlerDeps,
} from "../../app/api/billing/checkout/cancel-current/handler";
import {
  createConfirmGetHandler,
  type ConfirmCheckout,
  type ConfirmHandlerDeps,
} from "../../app/api/billing/confirm/handler";
import {
  createPortalPostHandler,
  type PortalHandlerDeps,
} from "../../app/api/billing/portal/handler";
import {
  createWebhookPostHandler,
  type WebhookHandlerDeps,
} from "../../app/api/billing/webhook/handler";

const APP_URL = "https://app.example";
const NOW = Date.parse("2026-08-28T12:00:00.000Z");
const RESERVATION_ID = "1cddf8d9-38ff-4d90-8b57-030b91082e18";
const ACCOUNT = {
  id: "user_123",
  email: "student@example.com",
  name: "Student",
  legacyPlan: "free",
  status: "active" as const,
  stripeCustomerId: "cus_123",
};

function formRequest(path: string, values: Record<string, string>, origin = APP_URL): Request {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(values),
  });
}

function checkoutDeps(overrides: Partial<CheckoutHandlerDeps> = {}): CheckoutHandlerDeps {
  return {
    baseUrl: () => APP_URL,
    billingEnabled: () => true,
    livemode: () => false,
    now: () => NOW,
    getSession: async () => ({ email: ACCOUNT.email }),
    findAccount: async () => ACCOUNT,
    consumeRateLimit: async () => ({ allowed: true }),
    findSubscriptionState: async () => ({
      activeCustomerId: null,
      trackedCustomerId: null,
      hasTrackedSubscriptions: false,
    }),
    hasUntrackedBilling: async () => false,
    changePlan: async () => ({ kind: "unchanged" }),
    createPortal: async () => ({ url: "https://billing.stripe.com/p/session" }),
    claimIntent: async () => ({
      decision: "claimed",
      reservationId: RESERVATION_ID,
      checkoutExpiresAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
      checkoutUrl: null,
      planCode: "core",
      billingCadence: "monthly",
    }),
    ensureCustomer: async () => "cus_123",
    resolvePrice: async () => "price_core_monthly",
    createCheckout: async () => ({
      id: "cs_test_123456789",
      url: "https://checkout.stripe.com/c/pay/cs_test_123456789",
    }),
    storeCheckout: async () => undefined,
    releaseIntent: async () => true,
    cancelIntent: async () => "cancelled",
    reportError: () => undefined,
    ...overrides,
  };
}

function checkoutCancelDeps(
  overrides: Partial<CheckoutCancelHandlerDeps> = {},
): CheckoutCancelHandlerDeps {
  return {
    baseUrl: () => APP_URL,
    getSession: async () => ({ email: ACCOUNT.email }),
    findAccount: async () => ACCOUNT,
    livemode: () => true,
    cancelIntent: async () => "cancelled",
    reportError: () => undefined,
    ...overrides,
  };
}

function checkoutCancelCurrentDeps(
  overrides: Partial<CheckoutCancelCurrentHandlerDeps> = {},
): CheckoutCancelCurrentHandlerDeps {
  return {
    baseUrl: () => APP_URL,
    getSession: async () => ({ email: ACCOUNT.email }),
    findAccount: async () => ACCOUNT,
    livemode: () => true,
    consumeRateLimit: async () => ({ allowed: true }),
    findCurrentReservation: async () => ({ reservationId: RESERVATION_ID }),
    cancelIntent: async () => "cancelled",
    reportError: () => undefined,
    ...overrides,
  };
}

test("checkout stays closed before any account or Stripe work when billing is disabled", async () => {
  let sessionCalls = 0;
  let checkoutCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    billingEnabled: () => false,
    getSession: async () => {
      sessionCalls += 1;
      return { email: ACCOUNT.email };
    },
    createCheckout: async () => {
      checkoutCalls += 1;
      return { id: "cs_test_unexpected", url: "https://checkout.stripe.com/c/pay/cs_test_unexpected" };
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    cadence: "monthly",
    checkoutToken: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=unavailable`);
  assert.equal(sessionCalls, 0);
  assert.equal(checkoutCalls, 0);
});

test("checkout blocks unreconciled legacy billing before reserving or creating anything", async () => {
  let claims = 0;
  let checkoutCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    hasUntrackedBilling: async () => true,
    claimIntent: async () => {
      claims += 1;
      throw new Error("must not reserve");
    },
    createCheckout: async () => {
      checkoutCalls += 1;
      throw new Error("must not create");
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "max",
    cadence: "monthly",
    checkoutToken: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=legacy`);
  assert.equal(claims, 0);
  assert.equal(checkoutCalls, 0);
});

test("a tracked canceled subscription can start Checkout after Stripe confirms no active billing", async () => {
  let legacyLookups = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    findSubscriptionState: async () => ({
      activeCustomerId: null,
      trackedCustomerId: ACCOUNT.stripeCustomerId,
      hasTrackedSubscriptions: true,
    }),
    hasUntrackedBilling: async () => {
      legacyLookups += 1;
      return false;
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    cadence: "monthly",
    checkoutToken: "abababab-abab-4bab-8bab-abababababab",
  }));

  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_123456789");
  assert.equal(legacyLookups, 1);
});

test("tracked billing with a mismatched customer link fails closed", async () => {
  let legacyLookups = 0;
  let checkoutCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    findSubscriptionState: async () => ({
      activeCustomerId: null,
      trackedCustomerId: "cus_different",
      hasTrackedSubscriptions: true,
    }),
    hasUntrackedBilling: async () => {
      legacyLookups += 1;
      return false;
    },
    createCheckout: async () => {
      checkoutCalls += 1;
      throw new Error("must not create");
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    cadence: "monthly",
    checkoutToken: "efefefef-efef-4fef-8fef-efefefefefef",
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=legacy`);
  assert.equal(legacyLookups, 0);
  assert.equal(checkoutCalls, 0);
});

test("an active tracked subscription uses plan management instead of a new Checkout", async () => {
  let changes = 0;
  let checkoutCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    findSubscriptionState: async () => ({
      activeCustomerId: ACCOUNT.stripeCustomerId,
      trackedCustomerId: ACCOUNT.stripeCustomerId,
      hasTrackedSubscriptions: true,
    }),
    changePlan: async () => {
      changes += 1;
      return { kind: "unchanged" };
    },
    createCheckout: async () => {
      checkoutCalls += 1;
      throw new Error("must not create");
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "max",
    cadence: "monthly",
    checkoutToken: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
  }));

  assert.equal(response.headers.get("location"), "https://billing.stripe.com/p/session");
  assert.equal(changes, 1);
  assert.equal(checkoutCalls, 0);
});

test("checkout claims before Stripe and uses the durable reservation for metadata, expiry, and idempotency", async () => {
  const order: string[] = [];
  let created: Parameters<CheckoutHandlerDeps["createCheckout"]> | null = null;
  let stored: Parameters<CheckoutHandlerDeps["storeCheckout"]>[0] | null = null;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async (input) => {
      order.push(`claim:${input.requestToken}`);
      return {
        decision: "claimed",
        reservationId: RESERVATION_ID,
        checkoutExpiresAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "core",
        billingCadence: "monthly",
      };
    },
    createCheckout: async (...args) => {
      order.push("stripe");
      created = args;
      return {
        id: "cs_test_123456789",
        url: "https://checkout.stripe.com/c/pay/cs_test_123456789",
      };
    },
    storeCheckout: async (input) => {
      order.push("store");
      stored = input;
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    cadence: "monthly",
    checkoutToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_123456789");
  assert.deepEqual(order, ["claim:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "stripe", "store"]);
  assert.ok(created);
  const [params, key] = created as unknown as Parameters<CheckoutHandlerDeps["createCheckout"]>;
  assert.equal(key, `blueprint-checkout-${RESERVATION_ID}`);
  assert.equal(params.expires_at, Math.floor((NOW + 60 * 60 * 1000) / 1000));
  assert.equal(params.metadata.checkout_reservation_id, RESERVATION_ID);
  assert.equal(params.metadata.user_id, ACCOUNT.id);
  assert.equal(
    params.cancel_url,
    `${APP_URL}/api/billing/checkout/cancel?reservation_id=${RESERVATION_ID}`,
  );
  assert.deepEqual(stored, {
    userId: ACCOUNT.id,
    livemode: false,
    reservationId: RESERVATION_ID,
    sessionId: "cs_test_123456789",
    sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_123456789",
  });
});

test("choosing a different plan supersedes an abandoned reservation for the old one instead of erroring", async () => {
  const claimPlans: string[] = [];
  let cancelled: Parameters<CheckoutHandlerDeps["cancelIntent"]>[0] | null = null;
  let releaseCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async (input) => {
      claimPlans.push(input.plan);
      if (claimPlans.length === 1) {
        return {
          decision: "busy",
          reservationId: RESERVATION_ID,
          checkoutExpiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
          checkoutUrl: null,
          planCode: "max",
          billingCadence: "monthly",
        };
      }
      return {
        decision: "claimed",
        reservationId: "22222222-2222-4222-8222-222222222222",
        checkoutExpiresAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "core",
        billingCadence: "monthly",
      };
    },
    cancelIntent: async (input) => {
      cancelled = input;
      return "cancelled";
    },
    releaseIntent: async () => {
      releaseCalls += 1;
      return true;
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "44444444-4444-4444-8444-444444444444",
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_123456789");
  assert.deepEqual(claimPlans, ["core", "core"]);
  assert.deepEqual(cancelled, { userId: ACCOUNT.id, livemode: false, reservationId: RESERVATION_ID });
  assert.equal(releaseCalls, 0);
});

test("a same-plan busy claim is left alone -- only a different plan/cadence gets superseded", async () => {
  let cancelCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async () => ({
      decision: "busy",
      reservationId: RESERVATION_ID,
      checkoutExpiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
      checkoutUrl: null,
      planCode: "core",
      billingCadence: "monthly",
    }),
    cancelIntent: async () => {
      cancelCalls += 1;
      return "cancelled";
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "55555555-5555-4555-8555-555555555555",
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=checkout-active`);
  assert.equal(cancelCalls, 0);
});

test("a phantom reservation with no Stripe session is released, not cancelled through Stripe", async () => {
  let released: Parameters<CheckoutHandlerDeps["releaseIntent"]>[0] | null = null;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async (input) => input.plan === "max"
      ? {
        decision: "busy",
        reservationId: RESERVATION_ID,
        checkoutExpiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "core",
        billingCadence: "monthly",
      }
      : {
        decision: "claimed",
        reservationId: "33333333-3333-4333-8333-333333333333",
        checkoutExpiresAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "max",
        billingCadence: "monthly",
      },
    cancelIntent: async () => "missing",
    releaseIntent: async (input) => {
      released = input;
      return true;
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "max",
    checkoutToken: "66666666-6666-4666-8666-666666666666",
  }));

  assert.equal(response.status, 303);
  assert.deepEqual(released, { userId: ACCOUNT.id, livemode: false, reservationId: RESERVATION_ID });
});

test("superseding never proceeds if the old reservation's plan actually finished checkout", async () => {
  let secondClaimCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async () => {
      secondClaimCalls += 1;
      return {
        decision: "busy",
        reservationId: RESERVATION_ID,
        checkoutExpiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "max",
        billingCadence: "monthly",
      };
    },
    cancelIntent: async () => "completed",
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "77777777-7777-4777-8777-777777777777",
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=managed`);
  assert.equal(secondClaimCalls, 1);
});

test("the Checkout cancel return releases only the authenticated account reservation", async () => {
  let cancelled: Parameters<CheckoutCancelHandlerDeps["cancelIntent"]>[0] | null = null;
  const handler = createCheckoutCancelGetHandler(checkoutCancelDeps({
    cancelIntent: async (input) => {
      cancelled = input;
      return "cancelled";
    },
  }));

  const response = await handler(new Request(
    `${APP_URL}/api/billing/checkout/cancel?reservation_id=${RESERVATION_ID}`,
  ));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=cancelled`);
  assert.deepEqual(cancelled, {
    userId: ACCOUNT.id,
    livemode: true,
    reservationId: RESERVATION_ID,
  });
});

test("cancel-current resolves and releases the account's own reservation without a reservation_id from the client", async () => {
  let looked: [string, boolean] | null = null;
  let cancelled: Parameters<CheckoutCancelCurrentHandlerDeps["cancelIntent"]>[0] | null = null;
  const handler = createCheckoutCancelCurrentPostHandler(checkoutCancelCurrentDeps({
    findCurrentReservation: async (userId, livemode) => {
      looked = [userId, livemode];
      return { reservationId: RESERVATION_ID };
    },
    cancelIntent: async (input) => {
      cancelled = input;
      return "cancelled";
    },
  }));

  const response = await handler(new Request(`${APP_URL}/api/billing/checkout/cancel-current`, {
    method: "POST",
    headers: { origin: APP_URL },
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=cancelled`);
  assert.deepEqual(looked, [ACCOUNT.id, true]);
  assert.deepEqual(cancelled, { userId: ACCOUNT.id, livemode: true, reservationId: RESERVATION_ID });
});

test("cancel-current is a no-op when there is nothing reserved for this account", async () => {
  let cancelCalls = 0;
  const handler = createCheckoutCancelCurrentPostHandler(checkoutCancelCurrentDeps({
    findCurrentReservation: async () => null,
    cancelIntent: async () => {
      cancelCalls += 1;
      return "cancelled";
    },
  }));

  const response = await handler(new Request(`${APP_URL}/api/billing/checkout/cancel-current`, {
    method: "POST",
    headers: { origin: APP_URL },
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=cancelled`);
  assert.equal(cancelCalls, 0);
});

test("cancel-current reports an already-completed reservation as managed rather than cancelled", async () => {
  const handler = createCheckoutCancelCurrentPostHandler(checkoutCancelCurrentDeps({
    cancelIntent: async () => "completed",
  }));

  const response = await handler(new Request(`${APP_URL}/api/billing/checkout/cancel-current`, {
    method: "POST",
    headers: { origin: APP_URL },
  }));

  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=managed`);
});

test("cancel-current rejects a cross-origin request before touching the account", async () => {
  let findCalls = 0;
  const handler = createCheckoutCancelCurrentPostHandler(checkoutCancelCurrentDeps({
    findAccount: async () => {
      findCalls += 1;
      return ACCOUNT;
    },
  }));

  const response = await handler(new Request(`${APP_URL}/api/billing/checkout/cancel-current`, {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));

  assert.equal(response.status, 403);
  assert.equal(findCalls, 0);
});

test("checkout accepts the current Max three-month offer", async () => {
  let claimed: Parameters<CheckoutHandlerDeps["claimIntent"]>[0] | null = null;
  let resolved: [string, string] | null = null;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async (input) => {
      claimed = input;
      return {
        decision: "claimed",
        reservationId: RESERVATION_ID,
        checkoutExpiresAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
        checkoutUrl: null,
        planCode: "max",
        billingCadence: "three_month",
      };
    },
    resolvePrice: async (plan, cadence) => {
      resolved = [plan, cadence];
      return "price_max_three_month";
    },
  }));

  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "max",
    cadence: "three_month",
    checkoutToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  }));

  assert.equal(response.status, 303);
  assert.deepEqual(claimed, {
    userId: ACCOUNT.id,
    livemode: false,
    plan: "max",
    cadence: "three_month",
    requestToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  });
  assert.deepEqual(resolved, ["max", "three_month"]);
});

test("checkout reuses a ready reservation and never creates a second Stripe session", async () => {
  let stripeCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    claimIntent: async () => ({
      decision: "ready",
      reservationId: RESERVATION_ID,
      checkoutExpiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_existing",
      planCode: "core",
      billingCadence: "monthly",
    }),
    createCheckout: async () => {
      stripeCalls += 1;
      throw new Error("must not create");
    },
  }));
  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }));
  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_existing");
  assert.equal(stripeCalls, 0);
});

test("checkout maps Stripe payment failures without storing an uncreated session", async () => {
  const events: string[] = [];
  let storeCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    createCheckout: async () => {
      throw Object.assign(new Error("declined"), { type: "StripeCardError", statusCode: 402 });
    },
    storeCheckout: async () => { storeCalls += 1; },
    reportError: (event) => { events.push(event); },
  }));
  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  }));
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=payment`);
  assert.equal(storeCalls, 0);
  assert.deepEqual(events, ["billing.checkout.failed"]);
});

test("a claimed reservation is released when Stripe work fails afterward, so the next attempt isn't blocked as busy", async () => {
  let released: { userId: string; livemode: boolean; reservationId: string } | null = null;
  const handler = createCheckoutPostHandler(checkoutDeps({
    resolvePrice: async () => { throw new Error("The configured Stripe price does not match the offer"); },
    releaseIntent: async (input) => {
      released = input;
      return true;
    },
  }));
  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "11111111-1111-4111-8111-111111111111",
  }));
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=error`);
  assert.deepEqual(released, { userId: ACCOUNT.id, livemode: false, reservationId: RESERVATION_ID });
});

test("a failed reservation release does not mask the original checkout error", async () => {
  const events: string[] = [];
  const handler = createCheckoutPostHandler(checkoutDeps({
    createCheckout: async () => { throw new Error("Stripe is unreachable"); },
    releaseIntent: async () => { throw new Error("release also failed"); },
    reportError: (event) => { events.push(event); },
  }));
  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "22222222-2222-4222-8222-222222222222",
  }));
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=error`);
  assert.deepEqual(events, ["billing.checkout.failed", "billing.checkout.reservation_release_failed"]);
});

test("a reservation is not released when Checkout already returned a live session before storeCheckout fails", async () => {
  let releaseCalls = 0;
  const handler = createCheckoutPostHandler(checkoutDeps({
    storeCheckout: async () => { throw new Error("supabase write failed"); },
    releaseIntent: async () => {
      releaseCalls += 1;
      return true;
    },
  }));
  const response = await handler(formRequest("/api/billing/checkout", {
    plan: "core",
    checkoutToken: "33333333-3333-4333-8333-333333333333",
  }));
  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_123456789");
  assert.equal(releaseCalls, 0);
});

function validCheckout(overrides: Partial<ConfirmCheckout> = {}): ConfirmCheckout {
  return {
    id: "cs_test_123456789",
    client_reference_id: ACCOUNT.id,
    metadata: {
      platform: "1500_blueprint",
      user_id: ACCOUNT.id,
      checkout_reservation_id: RESERVATION_ID,
    },
    mode: "subscription",
    status: "complete",
    customer: ACCOUNT.stripeCustomerId,
    subscription: "sub_123",
    ...overrides,
  };
}

function confirmDeps(overrides: Partial<ConfirmHandlerDeps> = {}): ConfirmHandlerDeps {
  return {
    baseUrl: () => APP_URL,
    getSession: async () => ({ email: ACCOUNT.email }),
    findAccount: async () => ACCOUNT,
    retrieveCheckout: async () => validCheckout(),
    retrieveSubscription: async () => ({ id: "sub_123" }),
    syncSubscription: async () => undefined,
    markCheckout: async () => true,
    reportError: () => undefined,
    ...overrides,
  };
}

test("confirm verifies Checkout identity before syncing and marking the reservation", async () => {
  const order: string[] = [];
  const handler = createConfirmGetHandler(confirmDeps({
    retrieveSubscription: async (id) => {
      order.push(`retrieve:${id}`);
      return { id };
    },
    syncSubscription: async (subscription, accountId) => {
      order.push(`sync:${(subscription as { id: string }).id}:${accountId}`);
    },
    markCheckout: async (sessionId, status, reservationId) => {
      order.push(`mark:${sessionId}:${status}:${reservationId}`);
      return true;
    },
  }));
  const response = await handler(new Request(`${APP_URL}/api/billing/confirm?session_id=cs_test_123456789`));
  assert.equal(response.headers.get("location"), `${APP_URL}/ultimate?billing=success`);
  assert.deepEqual(order, [
    "retrieve:sub_123",
    `sync:sub_123:${ACCOUNT.id}`,
    `mark:cs_test_123456789:completed:${RESERVATION_ID}`,
  ]);
});

test("confirm refuses a Checkout customer owned by another account", async () => {
  let subscriptionCalls = 0;
  let markCalls = 0;
  const handler = createConfirmGetHandler(confirmDeps({
    retrieveCheckout: async () => validCheckout({ customer: "cus_attacker" }),
    retrieveSubscription: async () => {
      subscriptionCalls += 1;
      return {};
    },
    markCheckout: async () => {
      markCalls += 1;
      return true;
    },
  }));
  const response = await handler(new Request(`${APP_URL}/api/billing/confirm?session_id=cs_other`));
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=error`);
  assert.equal(subscriptionCalls, 0);
  assert.equal(markCalls, 0);
});

function portalDeps(overrides: Partial<PortalHandlerDeps> = {}): PortalHandlerDeps {
  return {
    baseUrl: () => APP_URL,
    getSession: async () => ({ email: ACCOUNT.email }),
    findAccount: async () => ACCOUNT,
    consumeRateLimit: async () => ({ allowed: true }),
    createPortal: async () => ({ url: "https://billing.stripe.com/p/session" }),
    reportError: () => undefined,
    ...overrides,
  };
}

test("portal uses only the authenticated account customer and a local return path", async () => {
  let created: [string, string] | null = null;
  const handler = createPortalPostHandler(portalDeps({
    createPortal: async (customer, returnUrl) => {
      created = [customer, returnUrl];
      return { url: "https://billing.stripe.com/p/session" };
    },
  }));
  const response = await handler(formRequest("/api/billing/portal", {
    returnTo: "https://attacker.example/steal",
  }));
  assert.equal(response.headers.get("location"), "https://billing.stripe.com/p/session");
  assert.deepEqual(created, [ACCOUNT.stripeCustomerId, `${APP_URL}/settings/subscription`]);
});

test("portal failure reports safely and redirects to the requested local surface", async () => {
  const events: string[] = [];
  const handler = createPortalPostHandler(portalDeps({
    createPortal: async () => { throw new Error("provider unavailable"); },
    reportError: (event) => { events.push(event); },
  }));
  const response = await handler(formRequest("/api/billing/portal", { returnTo: "/pricing" }));
  assert.equal(response.headers.get("location"), `${APP_URL}/pricing?billing=error`);
  assert.deepEqual(events, ["billing.portal.failed"]);
});

function stripeEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_123",
    object: "event",
    api_version: "2026-08-27.basil",
    created: Math.floor(NOW / 1000),
    data: { object: { id: "cs_test_123" } as Stripe.Event.Data.Object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
    ...overrides,
  } as Stripe.Event;
}

function webhookRequest(): Request {
  return new Request(`${APP_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "signed-payload",
  });
}

function webhookDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    webhookSecret: () => "whsec_test",
    constructEvent: () => stripeEvent(),
    expectedLivemode: () => false,
    claimEvent: async () => ({ kind: "claimed", attempt: 1 }),
    processEvent: async () => undefined,
    finishEvent: async () => undefined,
    failEvent: async () => undefined,
    reportError: () => undefined,
    ...overrides,
  };
}

test("webhook verifies, claims, processes, and finishes the same delivery lease", async () => {
  const order: string[] = [];
  const handler = createWebhookPostHandler(webhookDeps({
    constructEvent: (payload, signature, secret) => {
      order.push(`verify:${payload}:${signature}:${secret}`);
      return stripeEvent();
    },
    claimEvent: async (event) => {
      order.push(`claim:${event.id}`);
      return { kind: "claimed", attempt: 3 };
    },
    processEvent: async (event) => { order.push(`process:${event.id}`); },
    finishEvent: async (eventId, attempt) => { order.push(`finish:${eventId}:${attempt}`); },
  }));
  const response = await handler(webhookRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.deepEqual(order, [
    "verify:signed-payload:signed:whsec_test",
    "claim:evt_123",
    "process:evt_123",
    "finish:evt_123:3",
  ]);
});

test("webhook idempotency returns an acknowledged duplicate without reprocessing", async () => {
  let processCalls = 0;
  const handler = createWebhookPostHandler(webhookDeps({
    claimEvent: async () => ({ kind: "processed", attempt: 2 }),
    processEvent: async () => { processCalls += 1; },
  }));
  const response = await handler(webhookRequest());
  assert.deepEqual(await response.json(), { received: true, duplicate: true });
  assert.equal(processCalls, 0);
});

test("webhook processing failures fail the claimed attempt with PII-safe metadata", async () => {
  let failed: [string, number, string] | null = null;
  const events: string[] = [];
  const handler = createWebhookPostHandler(webhookDeps({
    claimEvent: async () => ({ kind: "claimed", attempt: 4 }),
    processEvent: async () => {
      throw Object.assign(new Error("student@example.com"), { name: "StripeError", code: "api_error" });
    },
    failEvent: async (eventId, attempt, message) => { failed = [eventId, attempt, message]; },
    reportError: (event) => { events.push(event); },
  }));
  const response = await handler(webhookRequest());
  assert.equal(response.status, 500);
  assert.deepEqual(failed, ["evt_123", 4, "StripeError:api_error"]);
  assert.deepEqual(events, ["billing.webhook.processing_failed"]);
});

test("webhook rejects a mode mismatch before claiming the event", async () => {
  let claims = 0;
  const events: string[] = [];
  const handler = createWebhookPostHandler(webhookDeps({
    constructEvent: () => stripeEvent({ livemode: true }),
    claimEvent: async () => {
      claims += 1;
      return { kind: "claimed", attempt: 1 };
    },
    reportError: (event) => { events.push(event); },
  }));
  const response = await handler(webhookRequest());
  assert.equal(response.status, 400);
  assert.equal(claims, 0);
  assert.deepEqual(events, ["billing.webhook.mode_mismatch"]);
});
