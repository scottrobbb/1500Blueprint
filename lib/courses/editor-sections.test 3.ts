import assert from "node:assert/strict";
import test from "node:test";
import {
  blockSection,
  isSectionOpen,
  moduleSection,
  setSectionOpen,
  setSectionsOpen,
  type EditorSectionState,
} from "./editor-sections";

test("an untouched section falls back to the editor's default", () => {
  const state: EditorSectionState = {};
  assert.equal(isSectionOpen(state, "lesson-content", true), true);
  assert.equal(isSectionOpen(state, "course-settings", false), false);
});

// The reported bug: a collapsed section reopened as soon as the author clicked
// another lesson. An explicit choice has to outrank the default that put the
// section there in the first place.
test("an explicit choice outranks the default, in both directions", () => {
  const collapsed = setSectionOpen({}, "lesson-content", false);
  assert.equal(isSectionOpen(collapsed, "lesson-content", true), false);

  const expanded = setSectionOpen({}, "course-settings", true);
  assert.equal(isSectionOpen(expanded, "course-settings", false), true);
});

test("a choice survives choices made about other sections", () => {
  let state = setSectionOpen({}, moduleSection("m1"), false);
  state = setSectionOpen(state, blockSection("b1"), true);
  state = setSectionOpen(state, "lesson-settings", false);

  assert.equal(isSectionOpen(state, moduleSection("m1"), true), false);
  assert.equal(isSectionOpen(state, blockSection("b1"), false), true);
  assert.equal(isSectionOpen(state, "lesson-settings", true), false);
  // Untouched neighbours keep their defaults.
  assert.equal(isSectionOpen(state, moduleSection("m2"), true), true);
});

test("modules and blocks cannot collide on a shared id", () => {
  const state = setSectionOpen({}, moduleSection("shared"), false);
  assert.equal(isSectionOpen(state, blockSection("shared"), true), true);
});

test("re-setting a section to the value it already holds changes nothing", () => {
  const state = setSectionOpen({}, "lesson-content", false);
  assert.equal(setSectionOpen(state, "lesson-content", false), state);
});

// Collapse-all writes explicit entries rather than clearing them, so the first
// block does not spring back open on the next render.
test("collapse all beats the first-block-open default", () => {
  const ids = ["b1", "b2", "b3"].map(blockSection);
  const state = setSectionsOpen({}, ids, false);

  assert.equal(isSectionOpen(state, blockSection("b1"), true), false);
  assert.equal(isSectionOpen(state, blockSection("b3"), false), false);
});

test("expand all opens every block it is given and leaves the rest alone", () => {
  const state = setSectionsOpen(setSectionOpen({}, "lesson-settings", false), [blockSection("b1")], true);

  assert.equal(isSectionOpen(state, blockSection("b1"), false), true);
  assert.equal(isSectionOpen(state, "lesson-settings", true), false);
  assert.equal(setSectionsOpen(state, [], true), state);
});

test("the transitions never mutate the state they are given", () => {
  const state: EditorSectionState = {};
  setSectionOpen(state, "lesson-content", false);
  setSectionsOpen(state, [blockSection("b1")], false);
  assert.deepEqual(state, {});
});
