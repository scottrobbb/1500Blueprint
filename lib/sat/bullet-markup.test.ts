import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBulletMarkup, parseUnderlineMarkup } from "./formattedText";
import { isHighlightableText } from "@/components/test/MathText";

const notes = String.raw`\(\bullet\) The Community Archive Access Coalition was established in 1998.

\(\bullet\) In 2012, the state legislature passed the Community Records Act.`;

// Rhetorical synthesis notes ship their bullets as LaTeX. Untouched they either
// print as a literal \(\bullet\) or render through KaTeX as a small centred
// math operator, and the math also pushed the passage onto the renderer that
// cannot highlight.
test("bullet markers become real bullets, in every delimiter form", () => {
  assert.equal(normalizeBulletMarkup(String.raw`\(\bullet\) One`), "• One");
  assert.equal(normalizeBulletMarkup(String.raw`\[\bullet\] Two`), "• Two");
  assert.equal(normalizeBulletMarkup(String.raw`$\bullet$ Three`), "• Three");
  assert.equal(normalizeBulletMarkup(String.raw`\bullet Four`), "• Four");
  assert.equal(normalizeBulletMarkup(String.raw`   \(\bullet\)   Indented`), "• Indented");
});

test("every line of a notes list is converted, not just the first", () => {
  const out = normalizeBulletMarkup(notes);
  assert.equal(out.match(/•/g)?.length, 2);
  assert.doesNotMatch(out, /\\bullet/);
});

test("a bullet marker mid-sentence is left alone", () => {
  const inline = String.raw`The set \(\bullet\) denotes the operator.`;
  assert.equal(normalizeBulletMarkup(inline), inline);
});

test("both renderers see the same normalized text", () => {
  assert.equal(parseUnderlineMarkup(notes).map((segment) => segment.text).join(""), normalizeBulletMarkup(notes));
});

// The point of normalizing before the math test: a notes list is prose once the
// markers are characters, so it can be highlighted like any other passage.
test("a notes list stays highlightable, and real math still does not", () => {
  assert.equal(isHighlightableText(notes), true);
  assert.equal(isHighlightableText(String.raw`Solve \(2x + 1 = 9\).`), false);
  assert.equal(isHighlightableText("Year@@ROW@@1985"), false);
});
