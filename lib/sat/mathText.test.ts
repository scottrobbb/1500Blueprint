import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegacyMathText, parseMathSegments } from "@/components/test/MathText";

test("separates inline LaTeX from ordinary text", () => {
  assert.deepEqual(parseMathSegments("Solve $x^2=9$ for $x$."), [
    { type: "text", value: "Solve " },
    { type: "math", value: "x^2=9" },
    { type: "text", value: " for " },
    { type: "math", value: "x" },
    { type: "text", value: "." },
  ]);
});

test("renders escaped currency dollars as literal text", () => {
  assert.deepEqual(parseMathSegments("A \\$5 fee plus $2x$ dollars"), [
    { type: "text", value: "A $5 fee plus " },
    { type: "math", value: "2x" },
    { type: "text", value: " dollars" },
  ]);
});

test("does not treat an unmatched dollar as math", () => {
  assert.deepEqual(parseMathSegments("The price is $5."), [{ type: "text", value: "The price is $5." }]);
});

test("normalizes legacy square-root notation", () => {
  assert.equal(normalizeLegacyMathText("7sqrt(a) + SQRT (b)"), "7√(a) + √(b)");
});
