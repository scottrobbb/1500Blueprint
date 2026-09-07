import assert from "node:assert/strict";
import test from "node:test";
import {
  pauseQuestionTimer,
  questionTimerElapsedMs,
  resumeQuestionTimer,
  startQuestionTimer,
} from "./question-timer";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = 1_757_000_000_000;

test("a running clock counts the time since it started", () => {
  const timer = startQuestionTimer(T0);
  assert.equal(questionTimerElapsedMs(timer, T0), 0);
  assert.equal(questionTimerElapsedMs(timer, T0 + 30 * SECOND), 30 * SECOND);
});

// The reported bug, exactly as the student described it: start, pause at six
// seconds, wait six minutes, answer two minutes after resuming. That is two
// minutes and six seconds of work, and it used to record eight minutes.
test("paused time is not counted", () => {
  let timer = startQuestionTimer(T0);
  timer = pauseQuestionTimer(timer, T0 + 6 * SECOND);
  const resumedAt = T0 + 6 * SECOND + 6 * MINUTE;
  timer = resumeQuestionTimer(timer, resumedAt);

  const answeredAt = resumedAt + 2 * MINUTE;
  assert.equal(questionTimerElapsedMs(timer, answeredAt), 2 * MINUTE + 6 * SECOND);
});

test("a paused clock is frozen however long the pause lasts", () => {
  let timer = startQuestionTimer(T0);
  timer = pauseQuestionTimer(timer, T0 + 10 * SECOND);

  assert.equal(questionTimerElapsedMs(timer, T0 + 10 * SECOND), 10 * SECOND);
  assert.equal(questionTimerElapsedMs(timer, T0 + 60 * MINUTE), 10 * SECOND);
});

test("several pauses each bank their own segment", () => {
  let timer = startQuestionTimer(T0);
  let clock = T0;

  for (let round = 0; round < 3; round += 1) {
    clock += 5 * SECOND;
    timer = pauseQuestionTimer(timer, clock);
    clock += 10 * MINUTE;
    timer = resumeQuestionTimer(timer, clock);
  }
  clock += 5 * SECOND;

  assert.equal(questionTimerElapsedMs(timer, clock), 20 * SECOND);
});

test("repeated pauses and resumes are idempotent", () => {
  let timer = startQuestionTimer(T0);
  timer = pauseQuestionTimer(timer, T0 + 5 * SECOND);
  // A second pause must not bank the pause itself.
  timer = pauseQuestionTimer(timer, T0 + 5 * MINUTE);
  assert.equal(questionTimerElapsedMs(timer, T0 + 10 * MINUTE), 5 * SECOND);

  timer = resumeQuestionTimer(timer, T0 + 10 * MINUTE);
  // A second resume must not discard the segment already running.
  timer = resumeQuestionTimer(timer, T0 + 12 * MINUTE);
  assert.equal(questionTimerElapsedMs(timer, T0 + 13 * MINUTE), 5 * SECOND + 3 * MINUTE);
});

test("a backwards clock never subtracts from the total", () => {
  const timer = startQuestionTimer(T0);
  assert.equal(questionTimerElapsedMs(timer, T0 - 5 * MINUTE), 0);

  const banked = pauseQuestionTimer(startQuestionTimer(T0), T0 - 5 * MINUTE);
  assert.equal(questionTimerElapsedMs(banked, T0), 0);
});

test("the transitions never mutate the timer they are given", () => {
  const timer = startQuestionTimer(T0);
  const paused = pauseQuestionTimer(timer, T0 + SECOND);

  assert.equal(timer.runningSince, T0);
  assert.equal(timer.accumulatedMs, 0);
  assert.notEqual(paused, timer);
});
