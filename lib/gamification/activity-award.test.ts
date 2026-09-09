import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseActivityAwardRpcRow } from "./award-contract";
import {
  MODULE_PRACTICE_FLOOR,
  MODULE_PRACTICE_XP,
  QUESTION_BANK_XP,
  modulePracticeXp,
} from "./engine";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260909170000_activity_awards.sql", import.meta.url),
  "utf8",
);

test("a finished module pays the floor at zero accuracy and the full base at 100%", () => {
  assert.equal(modulePracticeXp(0, 44), Math.round(MODULE_PRACTICE_XP * MODULE_PRACTICE_FLOOR));
  assert.equal(modulePracticeXp(44, 44), MODULE_PRACTICE_XP);
  assert.equal(modulePracticeXp(22, 44), Math.round(MODULE_PRACTICE_XP * (MODULE_PRACTICE_FLOOR + (1 - MODULE_PRACTICE_FLOOR) / 2)));
});

test("module XP never leaves the range the award RPC accepts", () => {
  for (const [correct, total] of [[0, 0], [-5, 44], [99, 44], [1, 1], [0, 1]]) {
    const xp = modulePracticeXp(correct, total);
    assert.ok(Number.isSafeInteger(xp), `${correct}/${total} produced ${xp}`);
    assert.ok(xp >= 0 && xp <= 100, `${correct}/${total} produced ${xp}`);
  }
  // A module with no questions cannot be graded, so it earns nothing.
  assert.equal(modulePracticeXp(0, 0), 0);
});

test("a bank question is worth far less than a drill rep", () => {
  assert.ok(QUESTION_BANK_XP > 0);
  assert.ok(QUESTION_BANK_XP < 20, "one question should not rival the cheapest drill");
});

test("the activity award row parses without an attempt id", () => {
  assert.deepEqual(
    parseActivityAwardRpcRow({ inserted: true, xp_awarded: 3, new_achievement_ids: [] }),
    { inserted: true, xp_awarded: 3, new_achievement_ids: [] },
  );
  assert.equal(parseActivityAwardRpcRow({ inserted: true, xp_awarded: -1, new_achievement_ids: [] }), null);
  assert.equal(parseActivityAwardRpcRow({ inserted: "yes", xp_awarded: 3, new_achievement_ids: [] }), null);
  assert.equal(parseActivityAwardRpcRow({ inserted: true, xp_awarded: 3, new_achievement_ids: [""] }), null);
  assert.equal(parseActivityAwardRpcRow(null), null);
});

test("the award is idempotent on the (email, reason, ref) it reads back from xp_events", () => {
  assert.match(migration, /from public\.xp_events event/);
  assert.match(migration, /event\.reason = p_reason/);
  assert.match(migration, /event\.ref = p_ref/);
  // The early return is what makes a second award for the same ref a no-op.
  assert.match(migration, /return query select false, 0, array\[\]::text\[\]/);
});

test("the award records no attempt of its own", () => {
  // Writing either table would inflate the daily goal, the drill analytics, and
  // the drillsCompleted / perfectDrills / testsCompleted achievements. This RPC
  // may only read them to evaluate thresholds.
  assert.doesNotMatch(migration, /insert into public\.drill_attempts/);
  assert.doesNotMatch(migration, /insert into public\.test_attempts/);
  assert.doesNotMatch(migration, /insert into public\.module_attempts/);
  assert.doesNotMatch(migration, /insert into public\.question_bank_attempts/);
});

test("the award leaves the streak alone", () => {
  // A streak day is credited when the daily goal is met, and the goal counts
  // drills and tests. These surfaces contribute XP, level and achievements only.
  assert.doesNotMatch(migration, /streak_current\s*=/);
  assert.doesNotMatch(migration, /streak_longest\s*=/);
  assert.doesNotMatch(migration, /last_active_date\s*=/);
});

test("only the service role may call the award", () => {
  assert.match(migration, /revoke all on function public\.record_activity_award/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_activity_award\([\s\S]*?\) to service_role/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
});

test("the RPC rejects reasons and amounts the callers are not allowed to send", () => {
  assert.match(migration, /p_reason not in \('question_bank', 'module_practice'\)/);
  assert.match(migration, /p_xp_amount not between 0 and 100/);
});
