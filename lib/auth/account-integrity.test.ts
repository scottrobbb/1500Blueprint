import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260828020000_canonical_account_emails.sql", import.meta.url),
  "utf8",
);
const verification = readFileSync(
  new URL("../../supabase/tests/account_integrity_verification.sql", import.meta.url),
  "utf8",
);

test("canonical account identities fail closed before normalized uniqueness is added", () => {
  assert.match(migration, /email is distinct from lower\(trim\(email\)\)/i);
  assert.match(migration, /group by lower\(trim\(email\)\)[\s\S]+having count\(\*\) > 1/i);
  assert.match(migration, /raise exception[\s\S]+merge affected accounts/i);
  assert.match(migration, /create unique index if not exists users_normalized_email_idx/i);
  assert.match(migration, /validate constraint users_email_canonical_check/i);
});

test("post-deploy account verification requires every integrity count to be zero", () => {
  for (const key of [
    "duplicateNormalizedEmailGroups",
    "authIdentityEmailMismatches",
    "subscriptionCustomerMismatches",
    "duplicateActiveSubscriptionGroups",
    "invalidSubscriptionPlans",
    "invalidSubscriptionStatuses",
    "failedWebhookEvents",
    "expiredWebhookLeases",
  ]) {
    assert.match(verification, new RegExp(`'${key}'`));
  }
  assert.match(verification, /v_value <> 0[\s\S]+raise exception/i);
  assert.match(verification, /users_normalized_email_idx/i);
  assert.match(verification, /convalidated/i);
});
