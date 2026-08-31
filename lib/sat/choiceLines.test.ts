import assert from "node:assert/strict";
import test from "node:test";
import { splitStackedEquations } from "./choiceLines";

test("a flattened system of equations is restored to one equation per line", () => {
  assert.equal(
    splitStackedEquations("39x + 17y = 10 ax − 3by = 10"),
    "39x + 17y = 10\nax − 3by = 10",
  );
  assert.equal(
    splitStackedEquations("52x + 34y = 10 2ax + 4by = 10"),
    "52x + 34y = 10\n2ax + 4by = 10",
  );
  assert.equal(
    splitStackedEquations("13x − 17y = 10 ax + by = 10"),
    "13x − 17y = 10\nax + by = 10",
  );
});

test("a choice holding a single equation is left untouched", () => {
  assert.equal(splitStackedEquations("y = 3x + 4"), "y = 3x + 4");
  assert.equal(splitStackedEquations("42"), "42");
  assert.equal(splitStackedEquations(""), "");
});

test("prose around or between the equations blocks the split", () => {
  // The gap is not whitespace, so this is a sentence, not a stacked system.
  assert.equal(
    splitStackedEquations("x = 5 and y = 3"),
    "x = 5 and y = 3",
  );
  assert.equal(
    splitStackedEquations("The line y = 2x meets y = 4 at one point"),
    "The line y = 2x meets y = 4 at one point",
  );
});

test("an authored line break is preserved rather than re-derived", () => {
  const authored = "39x + 17y = 10\nax − 3by = 10";
  assert.equal(splitStackedEquations(authored), authored);
});

test("three stacked equations each get their own line", () => {
  assert.equal(
    splitStackedEquations("x + y = 1 2x + y = 4 3x − y = 2"),
    "x + y = 1\n2x + y = 4\n3x − y = 2",
  );
});
