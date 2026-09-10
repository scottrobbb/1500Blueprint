import assert from "node:assert/strict";
import test from "node:test";
import { toggleToolPanel, type ToolPanel } from "./tool-panels";

const open = (...tools: ToolPanel[]) => new Set<ToolPanel>(tools);
const sorted = (tools: ReadonlySet<ToolPanel>) => [...tools].sort();

test("the calculator and the reference sheet stay open together", () => {
  // The reported bug: opening one closed the other, because both lived in a
  // single slot.
  const withCalculator = toggleToolPanel(open(), "calculator");
  const withBoth = toggleToolPanel(withCalculator, "reference");
  assert.deepEqual(sorted(withBoth), ["calculator", "reference"]);

  const otherOrder = toggleToolPanel(toggleToolPanel(open(), "reference"), "calculator");
  assert.deepEqual(sorted(otherOrder), ["calculator", "reference"]);
});

test("clicking an open tool closes just that one", () => {
  const both = open("calculator", "reference");
  assert.deepEqual(sorted(toggleToolPanel(both, "calculator")), ["reference"]);
  assert.deepEqual(sorted(toggleToolPanel(both, "reference")), ["calculator"]);
  assert.deepEqual(sorted(toggleToolPanel(open("reference"), "reference")), []);
});

test("directions takes the screen alone, since it covers everything", () => {
  assert.deepEqual(sorted(toggleToolPanel(open("calculator", "reference"), "directions")), ["directions"]);
});

test("opening a tool from directions dismisses directions", () => {
  assert.deepEqual(sorted(toggleToolPanel(open("directions"), "calculator")), ["calculator"]);
  assert.deepEqual(sorted(toggleToolPanel(open("directions"), "reference")), ["reference"]);
  assert.deepEqual(sorted(toggleToolPanel(open("directions"), "directions")), []);
});

test("the caller's set is never mutated", () => {
  const before = open("calculator");
  const after = toggleToolPanel(before, "reference");
  assert.deepEqual(sorted(before), ["calculator"]);
  assert.notEqual(after, before);
});
