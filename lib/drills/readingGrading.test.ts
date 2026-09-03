import assert from "node:assert/strict";
import test from "node:test";
import {
  READING_FABRICATION_PENALTY_CAP,
  scoreReadingRecall,
  type GradedReadingPoint,
  type ReadingRecall,
} from "./readingGrading";

const points = (tier: GradedReadingPoint["tier"], recalls: ReadingRecall[]): GradedReadingPoint[] =>
  recalls.map((recall, i) => ({ label: `${tier} ${i + 1}`, text: "…", tier, recall }));

const all = (tier: GradedReadingPoint["tier"], recall: ReadingRecall) =>
  points(tier, [recall, recall, recall]);

test("a complete recall scores 100", () => {
  assert.equal(scoreReadingRecall(all("core", "full"), all("depth", "full"), []), 100);
});

test("core points carry the overwhelming majority of the score", () => {
  // Every main point but no supporting detail lands just under the pass mark.
  assert.equal(scoreReadingRecall(all("core", "full"), all("depth", "missed"), []), 80);
  // Every supporting detail but no main point is nowhere near it.
  assert.equal(scoreReadingRecall(all("core", "missed"), all("depth", "full"), []), 20);
});

test("one missed core point costs more than every missed depth point combined", () => {
  const oneCoreMissed = scoreReadingRecall(
    points("core", ["full", "full", "missed"]),
    all("depth", "full"),
    [],
  );
  const allDepthMissed = scoreReadingRecall(all("core", "full"), all("depth", "missed"), []);

  assert.equal(oneCoreMissed, 73);
  assert.ok(oneCoreMissed < allDepthMissed);
});

test("all core plus some depth clears the level 1-7 pass mark of 85", () => {
  const score = scoreReadingRecall(all("core", "full"), points("depth", ["full", "missed", "missed"]), []);

  assert.equal(score, 87);
  assert.ok(score >= 85);
});

test("only a near-perfect recall clears the level 8 pass mark of 95", () => {
  const twoOfThreeDepth = scoreReadingRecall(
    all("core", "full"),
    points("depth", ["full", "full", "missed"]),
    [],
  );
  const oneDepthPartial = scoreReadingRecall(
    all("core", "full"),
    points("depth", ["full", "full", "partial"]),
    [],
  );

  assert.ok(twoOfThreeDepth < 95);
  assert.ok(oneDepthPartial >= 95);
});

test("a partial recall is worth half a point", () => {
  assert.equal(scoreReadingRecall(all("core", "partial"), all("depth", "partial"), []), 50);
});

test("fabricated claims are penalized, up to a cap", () => {
  assert.equal(scoreReadingRecall(all("core", "full"), all("depth", "full"), ["invented"]), 95);
  assert.equal(
    scoreReadingRecall(all("core", "full"), all("depth", "full"), Array(20).fill("invented")),
    100 - READING_FABRICATION_PENALTY_CAP,
  );
});

test("an empty tier neither helps nor hurts", () => {
  assert.equal(scoreReadingRecall(all("core", "full"), [], []), 100);
});

test("the score never leaves 0-100", () => {
  assert.equal(scoreReadingRecall(all("core", "missed"), all("depth", "missed"), ["a", "b"]), 0);
});
