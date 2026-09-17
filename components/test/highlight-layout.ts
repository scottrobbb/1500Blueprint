import { parseUnderlineMarkup, unescapeDollarSigns } from "@/lib/sat/formattedText";
import { splitTableBlocks } from "@/lib/sat/table-markup";
import { cellRendersAsSource } from "./MathText";

// A stretch of the highlightable text, drawn as its own characters.
export type TextRange = { start: number; end: number };

// A cell holding math is drawn by MathText exactly as before, and since KaTeX's
// output is not the cell's source it is left out of the highlightable text
// altogether. Selections can run across it; they just cannot colour it.
export type LayoutCell = ({ kind: "text" } & TextRange) | { kind: "math"; source: string };

export type LayoutBlock =
  | ({ kind: "text" } & TextRange)
  | { kind: "table"; head: LayoutCell[]; body: LayoutCell[][] };

export type HighlightLayout = {
  // Every character a selection can land on, in the order the DOM holds them.
  // Highlight offsets index into this string.
  text: string;
  authorUnderlined: boolean[];
  blocks: LayoutBlock[];
};

// For text without a table this is the same string highlights have always been
// measured against, so highlights saved before tables were supported still
// land on the same words.
export function buildHighlightLayout(source: string): HighlightLayout {
  let text = "";
  const authorUnderlined: boolean[] = [];

  const append = (raw: string): TextRange => {
    const start = text.length;
    for (const segment of parseUnderlineMarkup(unescapeDollarSigns(raw))) {
      text += segment.text;
      for (let i = 0; i < segment.text.length; i++) authorUnderlined.push(segment.underlined);
    }
    return { start, end: text.length };
  };

  const cell = (raw: string): LayoutCell =>
    cellRendersAsSource(raw) ? { kind: "text", ...append(raw) } : { kind: "math", source: raw };

  // Cells are appended header first, then row by row, which is the order the
  // table renders them in.
  const blocks = splitTableBlocks(source).map((block): LayoutBlock => {
    if (block.kind === "text") return { kind: "text", ...append(block.source) };
    const [head = [], ...body] = block.rows;
    const headCells = head.map(cell);
    return { kind: "table", head: headCells, body: body.map((row) => row.map(cell)) };
  });

  return { text, authorUnderlined, blocks };
}
