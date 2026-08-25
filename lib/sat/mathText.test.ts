import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLegacyMathText,
  parseLegacyMathSegments,
  parseMathSegments,
  plainMathToLatex,
} from "@/components/test/MathText";

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

test("supports display and parenthesized LaTeX delimiters used by imported questions", () => {
  assert.deepEqual(parseMathSegments("Use $$x^2+1$$ and \\(y=2\\)."), [
    { type: "text", value: "Use " },
    { type: "math", value: "x^2+1", display: true },
    { type: "text", value: " and " },
    { type: "math", value: "y=2" },
    { type: "text", value: "." },
  ]);
});

test("supports bracketed display equations", () => {
  assert.deepEqual(parseMathSegments("Solve \\[17x-24y=41\\] next."), [
    { type: "text", value: "Solve " },
    { type: "math", value: "17x-24y=41", display: true },
    { type: "text", value: " next." },
  ]);
});

test("does not treat an unmatched dollar as math", () => {
  assert.deepEqual(parseMathSegments("The price is $5."), [{ type: "text", value: "The price is $5." }]);
});

test("normalizes legacy square-root notation", () => {
  assert.equal(normalizeLegacyMathText("7sqrt(a) + SQRT (b)"), "7√(a) + √(b)");
});

test("detects legacy equations inside prose without consuming the prose", () => {
  assert.deepEqual(
    parseLegacyMathSegments("Use the formula C = r·n, where C is the total cost."),
    [
      { type: "text", value: "Use the formula " },
      { type: "math", value: "C = r\\cdot n" },
      { type: "text", value: ", where C is the total cost." },
    ],
  );
});

test("converts imported slash notation into real LaTeX fractions", () => {
  assert.equal(
    plainMathToLatex("(12x + 30)/6 − b/10 = a(x + 2.25)"),
    "\\frac{12x + 30}{6} - \\frac{b}{10} = a(x + 2.25)",
  );
  assert.equal(plainMathToLatex("n = C / r"), "n = \\frac{C}{r}");
});

test("typesets standalone legacy answer choices and Unicode exponents", () => {
  assert.deepEqual(parseLegacyMathSegments("n = C − r"), [
    { type: "math", value: "n = C - r" },
  ]);
  assert.equal(plainMathToLatex("18x² − 11x²"), "18x^{2} - 11x^{2}");
});

test("does not interpret ordinary hyphenated prose as mathematics", () => {
  assert.deepEqual(parseLegacyMathSegments("Use the full-length practice test."), [
    { type: "text", value: "Use the full-length practice test." },
  ]);
});

test("keeps coefficients attached to imported square roots", () => {
  assert.deepEqual(parseLegacyMathSegments("f(x) = a√(x − b) + 12√(x − b)"), [
    { type: "math", value: "f(x) = a\\sqrt{x - b} + 12\\sqrt{x - b}" },
  ]);
});

test("typesets signed numeric answer choices", () => {
  assert.deepEqual(parseLegacyMathSegments("−20"), [
    { type: "math", value: "-20" },
  ]);
});

test("normalizes imported vulgar fractions", () => {
  assert.deepEqual(parseLegacyMathSegments("½"), [
    { type: "math", value: "\\frac{1}{2}" },
  ]);
  assert.equal(plainMathToLatex("x = ⅔"), "x = \\frac{2}{3}");
});
