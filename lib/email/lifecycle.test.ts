import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260829153512_resend_email_lifecycle.sql", import.meta.url),
  "utf8",
);

test("email lifecycle tables are private and service-role mediated", () => {
  for (const table of ["email_contacts", "email_contact_imports", "email_campaigns", "email_messages", "email_webhook_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on table[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table[\s\S]+to service_role/i);
  assert.match(migration, /email_webhook_events[\s\S]+processed_at timestamptz[\s\S]+processing_error text/i);
});

test("existing active students are backfilled while test accounts are excluded", () => {
  assert.match(migration, /insert into public\.email_contacts[\s\S]+from public\.users/i);
  assert.match(migration, /account_status = 'active'/i);
  assert.match(migration, /is_test_account = false/i);
});

test("password registration returns a one-time new-account signal", () => {
  assert.match(migration, /drop function if exists public\.record_password_login\(uuid, text, text, boolean\)/i);
  assert.match(migration, /returns table[\s\S]+is_new boolean/i);
  assert.match(migration, /is_new := existing_user_id is null/i);
  assert.match(migration, /revoke all on function public\.record_password_login[\s\S]+grant execute[\s\S]+service_role/i);
});

test("call mutations queue email work and the public webhook verifies raw signed requests", () => {
  const createRoute = readFileSync(new URL("../../app/api/admin/weekly-calls/route.ts", import.meta.url), "utf8");
  const webhookRoute = readFileSync(new URL("../../app/api/email/webhook/route.ts", import.meta.url), "utf8");
  assert.match(createRoute, /queueLiveCallEmail/);
  assert.match(createRoute, /after\(\(\) => processEmailWork\(\)\)/);
  assert.match(webhookRoute, /readTextBody/);
  assert.match(webhookRoute, /webhooks\.verify/);
  assert.match(webhookRoute, /svix-signature/);
});
