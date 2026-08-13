import assert from "node:assert/strict";
import test from "node:test";
import { sampleTest } from "./sampleTest";
import { coerceTimeMultiplier, initialState, makeReducer, type TestState, type TimeMultiplier } from "./testState";

for (const multiplier of [1.5, 2] as TimeMultiplier[]) {
  test(`${multiplier}x extended time scales module time and adds a five-minute break between modules`, () => {
    const reduce = makeReducer(sampleTest);
    let state = reduce(initialState(), { type: "START", extendedTime: multiplier });

    assert.equal(state.extendedTime, multiplier);
    assert.equal(state.timeLeft, Math.round(sampleTest.sections[0].minutesPerModule * 60 * multiplier));

    state = reduce(state, { type: "SUBMIT_MODULE" });
    state = reduce(state, { type: "ADVANCE" });
    assert.equal(state.phase, "break");
    assert.equal(state.breakTarget, "module2");
    assert.equal(state.timeLeft, 5 * 60);

    state = reduce(state, { type: "END_BREAK" });
    assert.equal(state.phase, "module");
    assert.equal(state.moduleOrder, 2);
    assert.equal(state.timeLeft, Math.round(sampleTest.sections[0].minutesPerModule * 60 * multiplier));

    state = reduce(state, { type: "SUBMIT_MODULE" });
    state = reduce(state, { type: "ADVANCE" });
    assert.equal(state.phase, "break");
    assert.equal(state.breakTarget, "nextSection");
    assert.equal(state.timeLeft, sampleTest.breakMinutes * 60);

    state = reduce(state, { type: "END_BREAK" });
    assert.equal(state.sectionIndex, 1);
    assert.equal(state.moduleOrder, 1);
    assert.equal(state.timeLeft, Math.round(sampleTest.sections[1].minutesPerModule * 60 * multiplier));
  });
}

test("coerceTimeMultiplier maps a legacy boolean extendedTime to 1.5x, and anything else to standard", () => {
  assert.equal(coerceTimeMultiplier(true), 1.5);
  assert.equal(coerceTimeMultiplier(false), 1);
  assert.equal(coerceTimeMultiplier(undefined), 1);
  assert.equal(coerceTimeMultiplier(1.5), 1.5);
  assert.equal(coerceTimeMultiplier(2), 2);
  assert.equal(coerceTimeMultiplier(1), 1);
});

test("standard timing continues directly into module two", () => {
  const reduce = makeReducer(sampleTest);
  let state = reduce(initialState(), { type: "START" });
  state = reduce(state, { type: "SUBMIT_MODULE" });
  state = reduce(state, { type: "ADVANCE" });

  assert.equal(state.phase, "module");
  assert.equal(state.moduleOrder, 2);
  assert.equal(state.breakTarget, undefined);
  assert.equal(state.timeLeft, sampleTest.sections[0].minutesPerModule * 60);
});

test("the review screen remains timed and submits at zero", () => {
  const reduce = makeReducer(sampleTest);
  const started = reduce(initialState(), { type: "START" });
  let state: TestState = { ...started, phase: "review", timeLeft: 2 };

  state = reduce(state, { type: "TICK" });
  assert.equal(state.phase, "review");
  assert.equal(state.timeLeft, 1);

  state = reduce(state, { type: "TICK" });
  assert.equal(state.phase, "moduleOver");
  assert.equal(state.timeLeft, 0);
});

test("the reducer stores five grid-in characters plus an optional minus sign", () => {
  const reduce = makeReducer(sampleTest);
  let state = reduce(initialState(), { type: "DEV_JUMP", sectionIndex: 1, moduleOrder: 1 });
  const gridQuestion = sampleTest.sections[1].module1.questions.find((question) => question.type === "grid");
  assert.ok(gridQuestion);

  state = reduce(state, { type: "SELECT", questionId: gridQuestion.id, value: "-12.345" });
  assert.equal(state.answers[gridQuestion.id], "-12.34");
});

test("resuming a saved module is a true pause — timeLeft carries over exactly", () => {
  const reduce = makeReducer(sampleTest);
  const started = reduce(initialState(), { type: "START" });
  const saved: TestState = { ...started, timeLeft: 217 };

  // Save-and-exit must not drain the clock in the background: however long the
  // student was away, RESUME installs the saved state verbatim.
  const resumed = reduce(saved, { type: "RESUME", state: saved });

  assert.equal(resumed.timeLeft, 217);
  assert.equal(resumed.phase, saved.phase);
});
