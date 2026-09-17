// Must match TABLE_ROWSEP in scripts/import/parse.ts.
export const TABLE_ROWSEP = "@@ROW@@";

// The importers store a table as its own paragraph of Markdown rows joined by
// TABLE_ROWSEP. Returns the rows as cells, header row first, or null when the
// block is not a table.
export function parseTableBlock(block: string): string[][] | null {
  const rows = block
    .split(new RegExp(`${TABLE_ROWSEP}|\\n`))
    .map((l) => l.trim())
    .filter(Boolean);
  if (rows.length < 2 || !rows.every((l) => l.startsWith("|"))) return null;
  return rows
    .filter((l) => !/^\|(?:\s*:?-{2,}:?\s*\|)+$/.test(l)) // drop the |---| separator row
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

export type TextBlock = { kind: "text"; source: string } | { kind: "table"; rows: string[][] };

// Splits text into prose and the tables between it. Text without a table comes
// back as one block holding the original string, untouched, because saved
// highlights are offsets into exactly that string. Once a table is present the
// blank lines around it are dropped: the table is laid out as its own block,
// so keeping them would stack extra empty lines above and below it.
export function splitTableBlocks(text: string): TextBlock[] {
  const parts = text.split(/(\n{2,})/);
  const blocks: TextBlock[] = [];
  let prose = "";
  const flushProse = () => {
    const source = prose.trim();
    if (source) blocks.push({ kind: "text", source });
    prose = "";
  };
  for (let i = 0; i < parts.length; i += 2) {
    const rows = parseTableBlock(parts[i]);
    if (rows) {
      flushProse();
      blocks.push({ kind: "table", rows });
    } else {
      prose += parts[i] + (parts[i + 1] ?? "");
    }
  }
  if (!blocks.some((block) => block.kind === "table")) return [{ kind: "text", source: text }];
  flushProse();
  return blocks;
}
