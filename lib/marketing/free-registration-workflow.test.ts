import assert from "node:assert/strict";
import test from "node:test";
import type { FreeAttribution } from "./attribution";
import {
  runFreeRegistrationNotice,
  type FreeRegistrationDependencies,
  type FreeRegistrationPayload,
} from "./free-registration-workflow";

const ATTRIBUTED = {
  email: "student@example.com",
  name: "Alex Morgan",
  attribution: { fbclid: "click-1", utm_medium: "paid_social" },
};

function dependencies(
  overrides: Partial<FreeRegistrationDependencies> = {},
): FreeRegistrationDependencies {
  return {
    webhookUrl: () => "https://hooks.zapier.example/free",
    claimConversion: async (_email, attribution) => attribution,
    post: async () => undefined,
    reportFailure: () => undefined,
    ...overrides,
  };
}

// A single conditional write in the database is the whole duplicate guard, so
// the workflow must never post without winning one.
function singleClaim() {
  let claimed = false;
  return async (_email: string, attribution: FreeAttribution): Promise<FreeAttribution | null> => {
    if (claimed) return null;
    claimed = true;
    return attribution;
  };
}

test("a completed registration posts name, email, and attribution", async () => {
  const posted: Array<{ url: string; payload: FreeRegistrationPayload }> = [];
  const outcome = await runFreeRegistrationNotice(
    ATTRIBUTED,
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

test("a second registration attempt for the same address sends nothing", async () => {
  let posts = 0;
  const shared = dependencies({
    claimConversion: singleClaim(),
    post: async () => { posts += 1; },
  });

  assert.equal(await runFreeRegistrationNotice(ATTRIBUTED, shared), "sent");
  assert.equal(await runFreeRegistrationNotice(ATTRIBUTED, shared), "already-sent");
  assert.equal(posts, 1);
});

test("a registration that never passed through /free is not a conversion", async () => {
  let claims = 0;
  let posts = 0;
  const outcome = await runFreeRegistrationNotice(
    { ...ATTRIBUTED, attribution: null },
    dependencies({
      claimConversion: async (_email, attribution) => { claims += 1; return attribution; },
      post: async () => { posts += 1; },
    }),
  );

  assert.equal(outcome, "no-attribution");
  assert.equal(claims, 0);
  assert.equal(posts, 0);
});

test("a /free registration with no ad parameters still converts", async () => {
  const posted: FreeRegistrationPayload[] = [];
  const outcome = await runFreeRegistrationNotice(
    { ...ATTRIBUTED, attribution: { fbclid: null, utm_medium: null } },
    dependencies({ post: async (_url, payload) => { posted.push(payload); } }),
  );

  assert.equal(outcome, "sent");
  assert.deepEqual(posted[0], {
    name: "Alex Morgan",
    email: "student@example.com",
    fbclid: null,
    utm_medium: null,
  });
});

test("an unconfigured webhook claims nothing", async () => {
  let claims = 0;
  const outcome = await runFreeRegistrationNotice(
    ATTRIBUTED,
    dependencies({
      webhookUrl: () => null,
      claimConversion: async () => { claims += 1; return null; },
    }),
  );

  assert.equal(outcome, "not-configured");
  assert.equal(claims, 0);
});

test("the claimed attribution is what gets sent, not the incoming cookie", async () => {
  const posted: FreeRegistrationPayload[] = [];
  const outcome = await runFreeRegistrationNotice(
    { ...ATTRIBUTED, attribution: { fbclid: null, utm_medium: "email" } },
    dependencies({
      // The stored row still holds the click behind an earlier attempt.
      claimConversion: async () => ({ fbclid: "click-1", utm_medium: "email" }),
      post: async (_url, payload) => { posted.push(payload); },
    }),
  );

  assert.equal(outcome, "sent");
  assert.equal(posted[0].fbclid, "click-1");
  assert.equal(posted[0].utm_medium, "email");
});

test("a rejected delivery is reported and keeps its claim", async () => {
  const failures: unknown[] = [];
  const shared = dependencies({
    claimConversion: singleClaim(),
    post: async () => { throw new Error("Zapier rejected the free registration event (500)"); },
    reportFailure: (error) => failures.push(error),
  });

  assert.equal(await runFreeRegistrationNotice(ATTRIBUTED, shared), "failed");
  assert.equal(failures.length, 1);
  // A duplicate conversion skews the ad account's optimization, so a retry is
  // deliberately not offered.
  assert.equal(await runFreeRegistrationNotice(ATTRIBUTED, shared), "already-sent");
});

test("a claim failure is reported without posting", async () => {
  let posts = 0;
  const failures: unknown[] = [];
  const outcome = await runFreeRegistrationNotice(
    ATTRIBUTED,
    dependencies({
      claimConversion: async () => { throw new Error("database unavailable"); },
      post: async () => { posts += 1; },
      reportFailure: (error) => failures.push(error),
    }),
  );

  assert.equal(outcome, "failed");
  assert.equal(posts, 0);
  assert.equal(failures.length, 1);
});
