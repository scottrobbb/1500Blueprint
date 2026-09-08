import assert from "node:assert/strict";
import test from "node:test";
import { clampCalculatorWidth } from "./CalculatorPanel";

test("the dock never gets narrower than the calculator needs", () => {
  assert.equal(clampCalculatorWidth(100, 1440), 320);
  assert.equal(clampCalculatorWidth(420, 1440), 420);
});

// The question keeps the larger share of the screen; a dock that could grow
// past the halfway mark would put the stem back behind the calculator, which is
// the whole reason it stopped floating.
test("the dock never takes more than its share of the viewport", () => {
  assert.equal(clampCalculatorWidth(2_000, 1440), 792);
  assert.equal(clampCalculatorWidth(900, 1000), 550);
});

// On a narrow window the floor wins over the fraction, so the panel stays
// usable rather than collapsing to a sliver.
test("a narrow window still gets a usable calculator", () => {
  assert.equal(clampCalculatorWidth(400, 500), 320);
  assert.equal(clampCalculatorWidth(100, 320), 320);
});
