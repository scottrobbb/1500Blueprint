import assert from "node:assert/strict";
import test from "node:test";
import { isHighlightableText } from "@/components/test/MathText";
import { promptHighlightKey } from "./highlights";
import { unescapeDollarSigns } from "./formattedText";

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

test("an escaped dollar sign renders as a dollar sign on the highlightable path", () => {
  // Regression: prompts with money were routed through HighlightablePassage,
  // which rendered the author's "\\$" escape literally as "\\$24". The escape is
  // invisible to the math regex, so these prompts read as highlightable and
  // must be unescaped the same way MathText unescapes them.
  const source = String.raw`a venue charges \$24 per person and \$16 after that`;
  assert.equal(isHighlightableText(source), true);
  assert.equal(
    unescapeDollarSigns(source),
    "a venue charges $24 per person and $16 after that",
  );
});

test("unescaping leaves ordinary text and real math delimiters alone", () => {
  assert.equal(unescapeDollarSigns("no dollars here"), "no dollars here");
  // An unescaped $...$ is a math delimiter and is not the escape sequence.
  assert.equal(unescapeDollarSigns("$x+1$"), "$x+1$");
});
