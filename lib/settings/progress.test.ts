import assert from "node:assert/strict";
import test from "node:test";
import { parseDailyGoal } from "./progress";

test("parseDailyGoal accepts whole-number goals in the supported range", () => {
  assert.equal(parseDailyGoal(1), 1);
  assert.equal(parseDailyGoal("5"), 5);
  assert.equal(parseDailyGoal(20), 20);
});

test("parseDailyGoal rejects invalid goals", () => {
  assert.equal(parseDailyGoal(0), null);
  assert.equal(parseDailyGoal(21), null);
  assert.equal(parseDailyGoal(2.5), null);
  assert.equal(parseDailyGoal("five"), null);
});
