import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { anonymizedEmail, ERASED_TABLES, isAnonymizedEmail, RETAINED_TABLES } from "./deletion-plan";

test("the anonymized address is unroutable, unique per account, and recognizable", () => {
  assert.equal(anonymizedEmail("abc123"), "deleted-abc123@deleted.invalid");
  assert.notEqual(anonymizedEmail("abc123"), anonymizedEmail("def456"));
  assert.equal(isAnonymizedEmail(anonymizedEmail("abc123")), true);
  assert.equal(isAnonymizedEmail(" DELETED-abc123@DELETED.INVALID "), true);
  assert.equal(isAnonymizedEmail("student@example.com"), false);
  assert.equal(isAnonymizedEmail(""), false);
});

test("no table is both erased and retained", () => {
  for (const { table } of ERASED_TABLES) {
    assert.equal(RETAINED_TABLES[table], undefined, `${table} is in both lists`);
  }
});

test("every retained table says why it is kept", () => {
  for (const [table, reason] of Object.entries(RETAINED_TABLES)) {
    assert.ok(reason.trim().length > 0, `${table} is retained without a reason`);
  }
});

// The point of this one: adding a table that belongs to a student and
// forgetting it here means their data outlives the deletion. A new name in the
// codebase fails this test until it is classified one way or the other.
test("every table the app queries is either erased, retained, or not a student's", () => {
  const referenced = new Set(
    execFileSync("git", ["grep", "-hoE", '\\.from\\("[a-z_]+"\\)', "--", "app", "lib", "components", "utils"], {
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => /\.from\("([a-z_]+)"\)/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name)),
  );

  // Shared content and bookkeeping that no single student owns. `users` is
  // here because it is anonymized in place rather than deleted.
  const notOwned = new Set([
    "users", "courses", "course_modules", "course_lessons", "course_lesson_blocks",
    "tests", "questions", "choices", "drills", "drill_questions", "drill_walkthrough_steps",
    "question_bank_catalog", "sat_skills", "weekly_calls", "call_recording_months",
    "call_recording_lessons", "plan_definitions", "plan_entitlements", "api_rate_limits",
    "explanation_edit_log", "question_content_edit_log",
  ]);

  // Student rows that go when their parent row goes, by foreign key.
  const cascaded = new Set(["flashcard_cards", "study_planner_tasks", "study_planner_task_questions"]);

  const erased = new Set(ERASED_TABLES.map((entry) => entry.table));
  for (const table of [...notOwned, ...cascaded]) {
    assert.equal(erased.has(table), false, `${table} is listed as erased and as not erased`);
  }

  const unclassified = [...referenced].filter(
    (table) => !erased.has(table) && !(table in RETAINED_TABLES) && !notOwned.has(table) && !cascaded.has(table),
  );
  assert.deepEqual(unclassified, [], `classify these in deletion-plan.ts: ${unclassified.join(", ")}`);
});
