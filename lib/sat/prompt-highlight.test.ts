import assert from "node:assert/strict";
import test from "node:test";
import { isHighlightableText } from "@/components/test/MathText";
import { promptHighlightKey } from "./highlights";

test("plain prompts are highlightable", () => {
  assert.equal(
    isHighlightableText(
      "The student wants to introduce Sato and Bell's principal findings to an audience unfamiliar with fog oases.",
    ),
    true,
  );
});

test("prompts that render math are not highlightable", () => {
  // KaTeX output does not map back onto the source string, so the offsets a
  // selection produces would point at the wrong characters.
  assert.equal(isHighlightableText("What is the value of $x^2 + 3$ when x = 4?"), false);
  assert.equal(isHighlightableText(String.raw`Solve \(2x + 1 = 9\).`), false);
});

test("table markup and empty prompts are not highlightable", () => {
  assert.equal(isHighlightableText("Year@@ROW@@1985"), false);
  assert.equal(isHighlightableText("   "), false);
});

test("the prompt key cannot collide with the passage key", () => {
  const id = "q-123";
  assert.notEqual(promptHighlightKey(id), id);
  assert.equal(promptHighlightKey(id), "q-123::prompt");
});
