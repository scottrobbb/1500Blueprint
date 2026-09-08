import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ORDER_SEED,
  newOrderSeed,
  parseOrderSeed,
  parseQuestionOrder,
  shuffleBySeed,
} from "./math";

const questions = Array.from({ length: 40 }, (_, i) => ({ id: `q${i + 1}` }));
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

test("only an explicit random order leaves the corpus order alone", () => {
  assert.equal(parseQuestionOrder("random"), "random");
  assert.equal(parseQuestionOrder("normal"), "normal");
  assert.equal(parseQuestionOrder(undefined), "normal");
  assert.equal(parseQuestionOrder("RANDOM"), "normal");
  assert.equal(parseQuestionOrder("1"), "normal");
});

test("a seed is only accepted as a whole number in range", () => {
  assert.equal(parseOrderSeed("12345"), 12345);
  assert.equal(parseOrderSeed("0"), 0);
  assert.equal(parseOrderSeed(String(MAX_ORDER_SEED)), MAX_ORDER_SEED);
  assert.equal(parseOrderSeed(undefined), null);
  assert.equal(parseOrderSeed(""), null);
  assert.equal(parseOrderSeed("-1"), null);
  assert.equal(parseOrderSeed("1.5"), null);
  assert.equal(parseOrderSeed("abc"), null);
  assert.equal(parseOrderSeed(String(MAX_ORDER_SEED + 1)), null);
});

test("the same seed always deals the same order", () => {
  // The point of the seed: a refresh must not renumber a session in progress.
  assert.deepEqual(ids(shuffleBySeed(questions, 4242)), ids(shuffleBySeed(questions, 4242)));
});

test("a different seed deals a different order", () => {
  assert.notDeepEqual(ids(shuffleBySeed(questions, 1)), ids(shuffleBySeed(questions, 2)));
});

test("shuffling keeps every question exactly once", () => {
  const shuffled = shuffleBySeed(questions, 99);
  assert.equal(shuffled.length, questions.length);
  assert.deepEqual([...ids(shuffled)].sort(), [...ids(questions)].sort());
});

test("shuffling does not reorder the array it was given", () => {
  const original = ids(questions);
  shuffleBySeed(questions, 7);
  assert.deepEqual(ids(questions), original);
});

test("a question's place does not depend on which others were selected", () => {
  // Filters change the pool between sessions; a stable rank per question means
  // the order is a property of the seed, not of what the filters removed.
  const seed = 31337;
  const full = ids(shuffleBySeed(questions, seed));
  const subset = questions.filter((_, i) => i % 3 === 0);
  const expected = full.filter((id) => subset.some((row) => row.id === id));
  assert.deepEqual(ids(shuffleBySeed(subset, seed)), expected);
});

test("an empty or single-question set survives shuffling", () => {
  assert.deepEqual(shuffleBySeed([], 5), []);
  assert.deepEqual(ids(shuffleBySeed([{ id: "only" }], 5)), ["only"]);
});

test("a generated seed is always one parseOrderSeed accepts", () => {
  for (let i = 0; i < 200; i += 1) {
    const seed = newOrderSeed();
    assert.equal(parseOrderSeed(String(seed)), seed);
  }
});
