import assert from "node:assert/strict";
import test from "node:test";
import type { FreeAttribution } from "./attribution";
import {
  runFreeRegistrationNotice,
  type FreeRegistrationDependencies,
  type FreeRegistrationPayload,
} from "./free-registration-workflow";

const NOTICE = { email: "student@example.com", name: "Alex Morgan" };

function dependencies(
  overrides: Partial<FreeRegistrationDependencies> = {},
): FreeRegistrationDependencies {
  return {
    webhookUrl: () => "https://hooks.zapier.example/free",
    claimAttribution: async () => ({ fbclid: "click-1", utm_medium: "paid_social" }),
    post: async () => undefined,
    reportFailure: () => undefined,
    ...overrides,
  };
}

// A single conditional claim in the database is the whole duplicate guard, so
// the workflow must never post without winning one.
function singleClaim(attribution: FreeAttribution) {
  let claimed = false;
  return async (): Promise<FreeAttribution | null> => {
    if (claimed) return null;
    claimed = true;
    return attribution;
  };
}

test("a completed registration posts name, email, and attribution", async () => {
  const posted: Array<{ url: string; payload: FreeRegistrationPayload }> = [];
  const outcome = await runFreeRegistrationNotice(
    NOTICE,
    dependencies({ post: async (url, payload) => { posted.push({ url, payload }); } }),
  );

  assert.equal(outcome, "sent");
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, "https://hooks.zapier.example/free");
  assert.deepEqual(posted[0].payload, {
    name: "Alex Morgan",
    email: "student@example.com",
    fbclid: "click-1",
    utm_medium: "paid_social",
  });
});

test("a replayed confirmation finds the claim taken and sends nothing", async () => {
  let posts = 0;
  const shared = dependencies({
    claimAttribution: singleClaim({ fbclid: "click-1", utm_medium: "paid_social" }),
    post: async () => { posts += 1; },
  });

  assert.equal(await runFreeRegistrationNotice(NOTICE, shared), "sent");
  assert.equal(await runFreeRegistrationNotice(NOTICE, shared), "no-attribution");
  assert.equal(posts, 1);
});

test("a registration that never passed through /free is not a conversion", async () => {
  let posts = 0;
  const outcome = await runFreeRegistrationNotice(
    NOTICE,
    dependencies({
      claimAttribution: async () => null,
      post: async () => { posts += 1; },
    }),
  );

  assert.equal(outcome, "no-attribution");
  assert.equal(posts, 0);
});

test("an unconfigured webhook claims nothing", async () => {
  let claims = 0;
  const outcome = await runFreeRegistrationNotice(
    NOTICE,
    dependencies({
      webhookUrl: () => null,
      claimAttribution: async () => { claims += 1; return null; },
    }),
  );

  assert.equal(outcome, "not-configured");
  assert.equal(claims, 0);
});

test("a rejected delivery is reported and keeps its claim", async () => {
  const failures: unknown[] = [];
  const claim = singleClaim({ fbclid: "click-1", utm_medium: null });
  const shared = dependencies({
    claimAttribution: claim,
    post: async () => { throw new Error("Zapier rejected the free registration event (500)"); },
    reportFailure: (error) => failures.push(error),
  });

  assert.equal(await runFreeRegistrationNotice(NOTICE, shared), "failed");
  assert.equal(failures.length, 1);
  // The confirmation token is single-use, so releasing the claim could only
  // ever produce a duplicate, never a retry.
  assert.equal(await runFreeRegistrationNotice(NOTICE, shared), "no-attribution");
});

test("a claim failure is reported without posting", async () => {
  let posts = 0;
  const failures: unknown[] = [];
  const outcome = await runFreeRegistrationNotice(
    NOTICE,
    dependencies({
      claimAttribution: async () => { throw new Error("database unavailable"); },
      post: async () => { posts += 1; },
      reportFailure: (error) => failures.push(error),
    }),
  );

  assert.equal(outcome, "failed");
  assert.equal(posts, 0);
  assert.equal(failures.length, 1);
});
