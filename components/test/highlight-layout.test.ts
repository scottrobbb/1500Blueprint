import assert from "node:assert/strict";
import test from "node:test";
import { parseUnderlineMarkup, unescapeDollarSigns } from "@/lib/sat/formattedText";
import { buildHighlightLayout, type LayoutBlock, type LayoutCell } from "./highlight-layout";
import { isHighlightableText } from "./MathText";

// Shaped like the importers' output: a table is its own paragraph of Markdown
// rows joined by @@ROW@@, with a |---| separator under the header.
const TABLE = "| Year | Visitors |@@ROW@@| --- | --- |@@ROW@@| 2019 | 4,200 |@@ROW@@| 2020 | 3,150 |";
const PASSAGE = `A park service counted visitors each year.\n\n${TABLE}\n\nWhich choice uses data from the table?`;

function cellText(text: string, cell: LayoutCell): string | null {
  return cell.kind === "text" ? text.slice(cell.start, cell.end) : null;
}

function tableOf(blocks: LayoutBlock[]) {
  const table = blocks.find((block) => block.kind === "table");
  assert.ok(table && table.kind === "table");
  return table;
}

// Regression: any passage or prompt holding a table was routed to the renderer
// that cannot highlight, so students could not mark up table questions at all.
test("text with an importer table is highlightable", () => {
  assert.equal(isHighlightableText(TABLE), true);
  assert.equal(isHighlightableText(PASSAGE), true);
});

test("a table does not make math in the prose highlightable", () => {
  assert.equal(isHighlightableText(`Solve \\(2x + 1 = 9\\).\n\n${TABLE}`), false);
});

test("row markers that do not form a table stay unhighlightable", () => {
  assert.equal(isHighlightableText("Year@@ROW@@1985"), false);
  assert.equal(isHighlightableText(`Intro\n\nYear@@ROW@@1985\n\n${TABLE}`), false);
});

// Highlights already saved on plain passages are offsets into this string, so
// it must not move for text without a table.
test("text without a table keeps the string highlights were saved against", () => {
  const source = String.raw`It costs \$24 and <u>rose</u> sharply.` + "\n\nA second paragraph.";
  const layout = buildHighlightLayout(source);
  const expected = parseUnderlineMarkup(unescapeDollarSigns(source)).map((segment) => segment.text).join("");
  assert.equal(layout.text, expected);
  assert.deepEqual(layout.blocks, [{ kind: "text", start: 0, end: expected.length }]);
  assert.equal(layout.authorUnderlined.filter(Boolean).length, "rose".length);
});

test("table cells join the highlightable text in the order they render", () => {
  const layout = buildHighlightLayout(PASSAGE);
  const [intro, , outro] = layout.blocks;
  assert.equal(layout.blocks.length, 3);
  assert.ok(intro.kind === "text" && outro.kind === "text");
  // The blank lines around the table are dropped; the table is its own block.
  assert.equal(layout.text.slice(intro.start, intro.end), "A park service counted visitors each year.");
  assert.equal(layout.text.slice(outro.start, outro.end), "Which choice uses data from the table?");

  const table = tableOf(layout.blocks);
  assert.deepEqual(table.head.map((cell) => cellText(layout.text, cell)), ["Year", "Visitors"]);
  assert.deepEqual(
    table.body.map((row) => row.map((cell) => cellText(layout.text, cell))),
    [["2019", "4,200"], ["2020", "3,150"]],
  );
  assert.equal(
    layout.text,
    "A park service counted visitors each year.YearVisitors20194,20020203,150Which choice uses data from the table?",
  );
  assert.equal(layout.authorUnderlined.length, layout.text.length);
});

// A typeset cell's rendered characters are not its source, so counting them
// would shift every offset after it. It is drawn but left out of the text.
test("cells MathText typesets are left out of the text; bare numbers are not", () => {
  const source = String.raw`| x | f(x) |@@ROW@@|---|---|@@ROW@@| −3 | $x^2$ |@@ROW@@| 1.5 | 2x + 1 |@@ROW@@| 4 | y^2 |`;
  const layout = buildHighlightLayout(source);
  assert.equal(isHighlightableText(source), true);
  const table = tableOf(layout.blocks);
  assert.deepEqual(table.body.map((row) => row.map((cell) => cell.kind)), [
    ["text", "math"],
    ["text", "math"],
    ["text", "math"],
  ]);
  assert.equal(layout.text, "xf(x)−31.54");
});

test("an escaped dollar in a cell is highlightable text, shown as a dollar sign", () => {
  const layout = buildHighlightLayout(String.raw`| Item | Price |@@ROW@@|---|---|@@ROW@@| Ticket | \$24 |`);
  const table = tableOf(layout.blocks);
  assert.equal(cellText(layout.text, table.body[0][1]), "$24");
});

test("a table on its own is one table block", () => {
  const layout = buildHighlightLayout(TABLE);
  assert.equal(layout.blocks.length, 1);
  assert.equal(layout.blocks[0].kind, "table");
});
