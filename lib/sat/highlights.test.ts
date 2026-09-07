import assert from "node:assert/strict";
import test from "node:test";
import {
  addHighlight,
  highlightCovering,
  removeHighlight,
  setHighlightNote,
  type Highlight,
  type HighlightsByQuestion,
} from "./highlights";

const yellow = { id: "a", start: 0, end: 5, color: "#fde68a" };
const blue = { id: "b", start: 20, end: 30, color: "#bfdbfe" };

// The reported bug: a highlight survived until the next click or the next
// selection, then vanished. The question bank's Highlight tool was only
// recolouring the browser's own selection, so nothing was ever stored. These
// pin the transitions the runners now share.
test("a second highlight does not replace the first", () => {
  let all: HighlightsByQuestion = {};
  all = addHighlight(all, "q1", yellow);
  all = addHighlight(all, "q1", blue);
  assert.deepEqual(all.q1.map((item) => item.id), ["a", "b"]);
});

test("highlights are kept per question, not shared across them", () => {
  let all: HighlightsByQuestion = {};
  all = addHighlight(all, "q1", yellow);
  all = addHighlight(all, "q2", blue);
  assert.deepEqual(all.q1.map((item) => item.id), ["a"]);
  assert.deepEqual(all.q2.map((item) => item.id), ["b"]);
});

test("removing a range takes only the highlights that overlap it", () => {
  let all = addHighlight(addHighlight({}, "q1", yellow), "q1", blue);
  all = removeHighlight(all, "q1", 2, 3);
  assert.deepEqual(all.q1.map((item) => item.id), ["b"], "only the overlapping one goes");

  const untouched = removeHighlight(all, "q1", 100, 110);
  assert.deepEqual(untouched.q1.map((item) => item.id), ["b"], "a range touching nothing removes nothing");
});

test("a note attaches to one highlight and leaves its neighbours alone", () => {
  let all = addHighlight(addHighlight({}, "q1", yellow), "q1", blue);
  all = setHighlightNote(all, "q1", "a", "check this claim");
  assert.equal(all.q1.find((item) => item.id === "a")?.note, "check this claim");
  assert.equal(all.q1.find((item) => item.id === "b")?.note, undefined);
});

test("the transitions never mutate the map they are given", () => {
  const before: HighlightsByQuestion = { q1: [yellow] };
  const snapshot = JSON.stringify(before);
  addHighlight(before, "q1", blue);
  removeHighlight(before, "q1", 0, 5);
  setHighlightNote(before, "q1", "a", "note");
  assert.equal(JSON.stringify(before), snapshot);
});

// Selecting text with the highlighter on now paints it immediately, so the
// component has to know whether a selection is new or lands on something the
// student already highlighted -- the second case must not stack a duplicate.
test("a selection inside an existing highlight resolves to that highlight", () => {
  const existing: Highlight = { id: "a", start: 10, end: 40, color: "#fde68a" };
  const highlights = [existing];

  assert.equal(highlightCovering(highlights, 10, 40), existing, "exact range");
  assert.equal(highlightCovering(highlights, 20, 30), existing, "range inside it");
  assert.equal(highlightCovering(highlights, 10, 11), existing, "single character inside it");
});

test("a selection reaching outside every highlight is new", () => {
  const highlights: Highlight[] = [{ id: "a", start: 10, end: 40, color: "#fde68a" }];

  assert.equal(highlightCovering(highlights, 5, 40), null, "starts before it");
  assert.equal(highlightCovering(highlights, 10, 45), null, "ends after it");
  assert.equal(highlightCovering(highlights, 50, 60), null, "misses it entirely");
  assert.equal(highlightCovering([], 10, 20), null, "nothing highlighted yet");
});
