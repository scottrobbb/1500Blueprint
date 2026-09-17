import { parseUnderlineMarkup, unescapeDollarSigns } from "@/lib/sat/formattedText";
import { splitTableBlocks } from "@/lib/sat/table-markup";
import { mathTokens, type MathToken } from "./MathText";

// A stretch of the highlightable text, drawn as its own characters.
export type TextRange = { start: number; end: number };

// Something MathText typesets -- KaTeX or a superscript. What it draws is not
// its source characters, so it is left out of the highlightable text: a
// selection can run across it but cannot colour it.
export type LayoutRun =
  | ({ kind: "text" } & TextRange)
  | { kind: "typeset"; token: MathToken; underlined: boolean };

export type LayoutBlock =
  | { kind: "text"; runs: LayoutRun[] }
  | { kind: "table"; head: LayoutRun[][]; body: LayoutRun[][][] };

export type HighlightLayout = {
  // Every character a selection can land on, in the order the DOM holds them.
  // Highlight offsets index into this string.
  text: string;
  authorUnderlined: boolean[];
  blocks: LayoutBlock[];
};

// MathText typesets a bare number, but it reads the same as text, and table
// data is what students most want to mark.
const BARE_NUMBER = /^[+−-]?\d+(?:\.\d+)?$/;

export function buildHighlightLayout(source: string): HighlightLayout {
  let text = "";
  const authorUnderlined: boolean[] = [];

  const appendChars = (chars: string, underlined: boolean): TextRange => {
    const start = text.length;
    text += chars;
    for (let i = 0; i < chars.length; i++) authorUnderlined.push(underlined);
    return { start, end: text.length };
  };

  const blocks = splitTableBlocks(source);

  // Text without a table is drawn as its characters, as it always has been.
  // Highlights saved on it are offsets into exactly this string.
  if (blocks.length === 1 && blocks[0].kind === "text") {
    for (const segment of parseUnderlineMarkup(unescapeDollarSigns(source))) {
      appendChars(segment.text, segment.underlined);
    }
    return { text, authorUnderlined, blocks: [{ kind: "text", runs: [{ kind: "text", start: 0, end: text.length }] }] };
  }

  // Everything around and inside a table is drawn the way QuestionContent drew
  // it before the table could be highlighted: MathText's typesetting stays, and
  // only the characters it leaves as text are counted.
  const typeset = (raw: string): LayoutRun[] =>
    parseUnderlineMarkup(raw).flatMap(({ text: segment, underlined }): LayoutRun[] => {
      const plain = unescapeDollarSigns(segment);
      if (BARE_NUMBER.test(plain.trim())) return [{ kind: "text", ...appendChars(plain, underlined) }];
      return mathTokens(segment).map((token): LayoutRun =>
        token.type === "text"
          ? { kind: "text", ...appendChars(token.value, underlined) }
          : { kind: "typeset", token, underlined },
      );
    });

  const layoutBlocks = blocks.map((block): LayoutBlock => {
    if (block.kind === "text") {
      // QuestionContent typeset each paragraph on its own; a standalone
      // expression is only recognised when it is the whole paragraph.
      const parts = block.source.split(/(\n{2,})/);
      const runs = parts.flatMap((part, index): LayoutRun[] =>
        index % 2 === 1 ? [{ kind: "text", ...appendChars(part, false) }] : typeset(part),
      );
      return { kind: "text", runs };
    }
    // Header first, then row by row: the order the table renders its cells in.
    const [head = [], ...body] = block.rows;
    const headCells = head.map(typeset);
    return { kind: "table", head: headCells, body: body.map((row) => row.map(typeset)) };
  });

  return { text, authorUnderlined, blocks: layoutBlocks };
}
