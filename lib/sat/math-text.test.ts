import assert from "node:assert/strict";
import test from "node:test";
import { isHighlightableText, parseMathSegments } from "@/components/test/MathText";

function rendersMath(source: string): boolean {
  return parseMathSegments(source).some((segment) => segment.type === "math");
}

const ARRAY_BODY = String.raw`\begin{array}{|c|c|} \hline \text{Atlas} & 61\% \\ \hline \text{Nova} & 39\% \\ \hline \end{array}`;
const ARRAY_ACROSS_LINES = `$${ARRAY_BODY.replace(/ \\\\ /g, " \\\\\n")}$`;

test("a LaTeX environment inside $...$ renders as math across newlines", () => {
  // Regression: inline $...$ stopped at a newline, so a table written over
  // several source lines fell through and printed its own LaTeX source.
  assert.equal(rendersMath(`$${ARRAY_BODY}$`), true);
  assert.equal(rendersMath(ARRAY_ACROSS_LINES), true);
});

test("a multi-line environment is not mistaken for highlightable plain text", () => {
  // It reads as math, so the prompt keeps MathText rendering instead of being
  // routed to the highlightable renderer, which would show the source.
  assert.equal(isHighlightableText(ARRAY_ACROSS_LINES), false);
});

test("ordinary inline and display math still render", () => {
  assert.equal(rendersMath("the value of $x^2 + 3$ here"), true);
  assert.equal(rendersMath("$$x = 1$$"), true);
  assert.equal(rendersMath(String.raw`\[x = 1\]`), true);
  assert.equal(rendersMath(String.raw`\(x = 1\)`), true);
});

test("prose with unescaped dollars is never swallowed across lines", () => {
  // Why inline $...$ still stops at a newline: without that, one stray dollar
  // would consume everything up to the next one, paragraphs away.
  assert.equal(rendersMath("It costs $5 today\nand $7 tomorrow"), false);
  assert.equal(rendersMath("was $50.\n\nLater it was $80."), false);
});

test("an unterminated environment does not run away", () => {
  // The closing $ is only honoured after a matching \end{...}, so a missing
  // delimiter cannot swallow the rest of the passage.
  assert.equal(rendersMath(String.raw`$\begin{array}{c} 1 \\ 2` + "\nand later $9 dollars"), false);
});
