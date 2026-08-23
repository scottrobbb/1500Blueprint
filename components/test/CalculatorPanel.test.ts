import assert from "node:assert/strict";
import test from "node:test";
import { clampCalculatorPosition } from "./CalculatorPanel";

test("keeps the calculator inside a 375px viewport while dragging", () => {
  assert.deepEqual(
    clampCalculatorPosition({
      x: 200,
      y: -20,
      panelWidth: 352,
      panelHeight: 448,
      viewportWidth: 375,
      viewportHeight: 667,
    }),
    { x: 15, y: 8 },
  );
});

test("pins a viewport-width expanded calculator to the gutter", () => {
  assert.deepEqual(
    clampCalculatorPosition({
      x: 100,
      y: 300,
      panelWidth: 359,
      panelHeight: 651,
      viewportWidth: 375,
      viewportHeight: 667,
    }),
    { x: 8, y: 8 },
  );
});
