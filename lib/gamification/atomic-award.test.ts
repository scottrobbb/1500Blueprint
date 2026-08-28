import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTestAwardRpcRow } from "./award-contract";
import {
  ACHIEVEMENTS,
  achievementRules,
  satisfiedAchievements,
  type Stats,
} from "./engine";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260827220000_atomic_test_awards_and_checkout_intents.sql", import.meta.url),
  "utf8",
);

const EMPTY_STATS: Stats = {
  xp: 0,
  level: 0,
  streakCurrent: 0,
  streakLongest: 0,
  drillsCompleted: 0,
  testsCompleted: 0,
  dailyGoalsHit: 0,
  bestTestScore: 0,
  perfectDrills: 0,
};

test("serializable achievement rules exactly match every catalog predicate", () => {
  const rules = achievementRules();
  assert.equal(rules.length, ACHIEVEMENTS.length);
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    const below = { ...EMPTY_STATS, [rule.metric]: Math.max(0, rule.threshold - 1) };
    const at = { ...EMPTY_STATS, [rule.metric]: rule.threshold };
    if (rule.threshold > 0) assert.equal(satisfiedAchievements(below).includes(rule.id), false);
    assert.equal(satisfiedAchievements(at).includes(rule.id), true);
  }
});

test("atomic award results preserve first-write and retry contracts", () => {
  assert.deepEqual(parseTestAwardRpcRow({
    attempt_id: "attempt-1",
    inserted: true,
    xp_awarded: 425,
    new_achievement_ids: ["tests-1"],
  }), {
    attempt_id: "attempt-1",
    inserted: true,
    xp_awarded: 425,
    new_achievement_ids: ["tests-1"],
  });
  assert.deepEqual(parseTestAwardRpcRow({
    attempt_id: "attempt-1",
    inserted: false,
    xp_awarded: 0,
    new_achievement_ids: [],
  }), {
    attempt_id: "attempt-1",
    inserted: false,
    xp_awarded: 0,
    new_achievement_ids: [],
  });
  assert.equal(parseTestAwardRpcRow({
    attempt_id: "attempt-1",
    inserted: false,
    xp_awarded: -1,
    new_achievement_ids: [],
  }), null);
});

test("migration keeps the attempt ledger and all awards inside one locked transaction", () => {
  assert.match(migration, /function public\.record_test_award[\s\S]+security definer/i);
  assert.match(migration, /from public\.users account[\s\S]+for update/i);
  assert.match(migration, /insert into public\.test_attempts[\s\S]+insert into public\.xp_events[\s\S]+update public\.users[\s\S]+insert into public\.user_achievements/i);
  assert.match(migration, /attempt\.client_token = p_client_token[\s\S]+select v_existing_attempt_id, false, 0/i);
  assert.match(migration, /revoke all on function public\.record_test_award[\s\S]+grant execute[\s\S]+to service_role/i);
});

test("checkout reservations are account-mode scoped and reuse one Stripe identity during a lease recovery", () => {
  assert.match(migration, /primary key \(user_id, livemode\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /status = 'creating'[\s\S]+lease_expires_at = v_now \+ interval '5 minutes'/i);
  assert.match(migration, /preserve reservation_id[\s\S]+same Stripe idempotency/i);
  assert.match(migration, /status in \('completed', 'expired'\) or v_intent\.checkout_expires_at <= v_now/i);
  assert.match(migration, /revoke all on table public\.billing_checkout_intents from public, anon, authenticated/i);
});
