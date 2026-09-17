import assert from "node:assert/strict";
import test from "node:test";
import { parseUnderlineMarkup, unescapeDollarSigns } from "@/lib/sat/formattedText";
import { buildHighlightLayout, type HighlightLayout, type LayoutBlock, type LayoutRun } from "./highlight-layout";
import { isHighlightableText, mathTokens } from "./MathText";

// Shaped like the importers' output: a table is its own paragraph of Markdown
// rows joined by @@ROW@@, with a |---| separator under the header.
const TABLE = "| Year | Visitors |@@ROW@@| --- | --- |@@ROW@@| 2019 | 4,200 |@@ROW@@| 2020 | 3,150 |";
const PASSAGE = `A park service counted visitors each year.\n\n${TABLE}\n\nWhich choice uses data from the table?`;

// What a run of the layout draws: its characters when it is text, or the
// MathText token it typesets.
function describe(layout: HighlightLayout, runs: LayoutRun[]) {
  return runs.map((run) => (run.kind === "text" ? layout.text.slice(run.start, run.end) : run.token));
}

// The same description of what MathText itself draws for that source.
function drawnByMathText(source: string) {
  return mathTokens(source).map((token) => (token.type === "text" ? token.value : token));
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

test("a table does not make LaTeX in the prose highlightable", () => {
  assert.equal(isHighlightableText(`Solve \\(2x + 1 = 9\\).\n\n${TABLE}`), false);
});

test("row markers that do not form a table stay unhighlightable", () => {
  assert.equal(isHighlightableText("Year@@ROW@@1985"), false);
  assert.equal(isHighlightableText(`Intro\n\nYear@@ROW@@1985\n\n${TABLE}`), false);
});

// Highlights already saved on plain passages are offsets into this string, so
// neither it nor how it is drawn may change for text without a table.
test("text without a table keeps the string highlights were saved against", () => {
  const source = String.raw`It costs \$24 and <u>rose</u> as x^2 + 3.` + "\n\nA second paragraph.";
  const layout = buildHighlightLayout(source);
  const expected = parseUnderlineMarkup(unescapeDollarSigns(source)).map((segment) => segment.text).join("");
  assert.equal(layout.text, expected);
  assert.deepEqual(layout.blocks, [{ kind: "text", runs: [{ kind: "text", start: 0, end: expected.length }] }]);
  assert.equal(layout.authorUnderlined.filter(Boolean).length, "rose".length);
});

test("table cells join the highlightable text in the order they render", () => {
  const layout = buildHighlightLayout(PASSAGE);
  assert.equal(layout.blocks.length, 3);
  const [intro, , outro] = layout.blocks;
  assert.ok(intro.kind === "text" && outro.kind === "text");
  // The blank lines around the table are dropped; the table is its own block.
  assert.deepEqual(describe(layout, intro.runs), ["A park service counted visitors each year."]);
  assert.deepEqual(describe(layout, outro.runs), ["Which choice uses data from the table?"]);

  const table = tableOf(layout.blocks);
  assert.deepEqual(table.head.map((cell) => describe(layout, cell)), [["Year"], ["Visitors"]]);
  assert.deepEqual(
    table.body.map((row) => row.map((cell) => describe(layout, cell))),
    [[["2019"], ["4,200"]], [["2020"], ["3,150"]]],
  );
  assert.equal(
    layout.text,
    "A park service counted visitors each year.YearVisitors20194,20020203,150Which choice uses data from the table?",
  );
  assert.equal(layout.authorUnderlined.length, layout.text.length);
});

// Regression: the first version drew the prose around a table as raw
// characters, so a math-bank prompt's "x^2" lost its superscript and
// "f(x) = 2x + 3" lost its typesetting the moment it became highlightable.
test("prose around a table keeps MathText's typesetting, leaving it out of the text", () => {
  const prose = "For f(x) = 2x + 3, what is x^2?";
  const layout = buildHighlightLayout(`${prose}\n\n${TABLE}`);
  const [intro] = layout.blocks;
  assert.ok(intro.kind === "text");
  assert.deepEqual(describe(layout, intro.runs), drawnByMathText(prose));
  assert.ok(intro.runs.some((run) => run.kind === "typeset" && run.token.type === "katex"));
  assert.ok(intro.runs.some((run) => run.kind === "typeset" && run.token.type === "sup"));
  assert.doesNotMatch(layout.text, /\^|2x \+ 3/);
});

test("prose paragraphs are typeset one at a time, as QuestionContent did", () => {
  // A standalone expression is only recognised when it is the whole paragraph.
  const layout = buildHighlightLayout(`Solve for n.\n\n3n + 4 = 10\n\n${TABLE}`);
  const [intro] = layout.blocks;
  assert.ok(intro.kind === "text");
  const described = describe(layout, intro.runs);
  assert.deepEqual(described.slice(0, 2), ["Solve for n.", "\n\n"]);
  assert.deepEqual(described.slice(2), drawnByMathText("3n + 4 = 10"));
});

test("cells keep MathText's typesetting; bare numbers stay highlightable text", () => {
  const source = String.raw`| x | f(x) |@@ROW@@|---|---|@@ROW@@| −3 | $x^2$ |@@ROW@@| 1.5 | 2x + 1 |@@ROW@@| 4 | y^2 |`;
  const layout = buildHighlightLayout(source);
  assert.equal(isHighlightableText(source), true);
  const table = tableOf(layout.blocks);
  for (const [raw, cell] of [["$x^2$", table.body[0][1]], ["2x + 1", table.body[1][1]], ["y^2", table.body[2][1]]] as const) {
    assert.deepEqual(describe(layout, cell), drawnByMathText(raw));
  }
  assert.deepEqual(table.body.map((row) => describe(layout, row[0])), [["−3"], ["1.5"], ["4"]]);
  assert.equal(layout.text, "xf(x)−31.54");
});

test("underlined typeset pieces keep their underline", () => {
  const layout = buildHighlightLayout("| a | <u>2x + 1 is x^2</u> |@@ROW@@|---|---|@@ROW@@| 1 | 2 |");
  const cell = tableOf(layout.blocks).head[1];
  assert.ok(cell.some((run) => run.kind === "typeset"));
  for (const run of cell) {
    if (run.kind === "typeset") assert.equal(run.underlined, true);
    else assert.ok(layout.authorUnderlined.slice(run.start, run.end).every(Boolean));
  }
});

test("an escaped dollar in a cell is highlightable text, shown as a dollar sign", () => {
  const layout = buildHighlightLayout(String.raw`| Item | Price |@@ROW@@|---|---|@@ROW@@| Ticket | \$24 |`);
  assert.deepEqual(describe(layout, tableOf(layout.blocks).body[0][1]), ["$24"]);
});

test("a table on its own is one table block", () => {
  const layout = buildHighlightLayout(TABLE);
  assert.equal(layout.blocks.length, 1);
  assert.equal(layout.blocks[0].kind, "table");
});
