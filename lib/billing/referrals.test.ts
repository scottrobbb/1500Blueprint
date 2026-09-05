import assert from "node:assert/strict";
import test from "node:test";
import { referralMetadataUpdate, rewardfulReferral } from "./referrals";

const REFERRAL = "b533bfca-7c70-4dec-9691-e136a8d9a26c";

test("a referral is only accepted in Rewardful's own UUID shape", () => {
  assert.equal(rewardfulReferral(REFERRAL), REFERRAL);
  assert.equal(rewardfulReferral(`  ${REFERRAL.toUpperCase()}  `), REFERRAL, "trimmed and normalized");
  assert.equal(rewardfulReferral(null), null);
  assert.equal(rewardfulReferral(""), null);
  assert.equal(rewardfulReferral("bond007"), null);
  // The value reaches the server in a form field, so it is attacker-controlled
  // like any other; nothing but a UUID may reach Stripe metadata.
  assert.equal(rewardfulReferral(`${REFERRAL} OR 1=1`), null);
  assert.equal(rewardfulReferral(`${REFERRAL}${REFERRAL}`), null);
});

test("an unreferred checkout writes nothing", () => {
  assert.equal(referralMetadataUpdate({}, null), null);
  assert.equal(referralMetadataUpdate({ platform: "1500_blueprint" }, null), null);
});

test("a referred customer records the affiliate that sent them", () => {
  assert.deepEqual(
    referralMetadataUpdate({ platform: "1500_blueprint" }, REFERRAL),
    { referral: REFERRAL },
  );
  assert.deepEqual(referralMetadataUpdate(null, REFERRAL), { referral: REFERRAL });
});

test("the first affiliate keeps the customer", () => {
  const existing = "11111111-2222-3333-4444-555555555555";
  assert.equal(
    referralMetadataUpdate({ referral: existing }, REFERRAL),
    null,
    "a later link from a different affiliate must not poach an existing referral",
  );
  assert.equal(referralMetadataUpdate({ referral: REFERRAL }, REFERRAL), null, "and never rewrites its own");
});
