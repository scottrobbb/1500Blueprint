/**
 * Parse a Scott practice-test .docx into structured modules/questions.
 *
 *   npx tsx scripts/import/parse.ts "<path-to.docx>" [outDir]
 *
 * Prints a summary and writes parsed JSON + extracted images to `outDir`
 * (default: a temp folder). No DB / network — pure parsing, safe to iterate.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import mammoth from "mammoth";
import {
  canonicalDomain,
  domainForSkill,
  normalizeDifficulty,
  type Difficulty,
} from "./taxonomy";

export type Section = "rw" | "math";

export type ParsedChoice = { letter: string; text: string };

export type ParsedQuestion = {
  position: number;
  rawNumber: number | null;
  type: "mc" | "grid";
  section: Section;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty | null;
  passage: string | null;
  prompt: string;
  choices: ParsedChoice[];
  correct: string | null;
  acceptedAnswers: string[];
  figure: string | null;
  needsReview: boolean;
  notes: string[];
};

export type ParsedModule = {
  section: Section;
  order: 1 | 2;
  variant: "easy" | "hard" | null;
  label: string;
  questions: ParsedQuestion[];
};

export type ParseResult = {
  modules: ParsedModule[];
  images: Map<string, { buffer: Buffer; contentType: string }>;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? m);
}

/** mammoth HTML → ordered lines, with images as `[[IMG:name]]` markers. */
// A data table (mammoth emits a real <table>) must keep its structure, not be
// flattened into a run-on line. Convert it to a Markdown table kept on ONE line
// (rows joined by a sentinel) so it survives the line split and passage assembly
// as a single block; the renderer splits the sentinel and emits an HTML <table>.
const TABLE_ROWSEP = "@@ROW@@";
const UNDERLINE_OPEN = "\uE000";
const UNDERLINE_CLOSE = "\uE001";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function childElements(node: Node): Element[] {
  const elements: Element[] = [];
  for (let index = 0; index < node.childNodes.length; index++) {
    const child = node.childNodes.item(index);
    if (child?.nodeType === 1) elements.push(child as Element);
  }
  return elements;
}

function elementName(node: Element): string {
  return node.localName || node.nodeName.split(":").pop() || node.nodeName;
}

function directChild(node: Element, name: string): Element | null {
  return childElements(node).find((child) => elementName(child) === name) ?? null;
}

function renderOmmlNode(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const name = elementName(element);
  const renderChildren = () => childElements(element).map(renderOmmlNode).join("");

  if (name === "t") return element.textContent ?? "";
  if (name.endsWith("Pr") || name === "ctrlPr") return "";
  if (name === "f") {
    return `\\frac{${directChild(element, "num") ? renderOmmlNode(directChild(element, "num") as Element) : ""}}{${
      directChild(element, "den") ? renderOmmlNode(directChild(element, "den") as Element) : ""
    }}`;
  }
  if (name === "rad") {
    const degree = directChild(element, "deg");
    const expression = directChild(element, "e");
    const body = expression ? renderOmmlNode(expression) : "";
    return degree && renderOmmlNode(degree).trim()
      ? `\\sqrt[${renderOmmlNode(degree).trim()}]{${body}}`
      : `\\sqrt{${body}}`;
  }
  if (name === "sSup") {
    return `{${renderOmmlNode(directChild(element, "e") as Element)}}^{${renderOmmlNode(
      directChild(element, "sup") as Element,
    )}}`;
  }
  if (name === "sSub") {
    return `{${renderOmmlNode(directChild(element, "e") as Element)}}_{${renderOmmlNode(
      directChild(element, "sub") as Element,
    )}}`;
  }
  if (name === "sSubSup") {
    return `{${renderOmmlNode(directChild(element, "e") as Element)}}_{${renderOmmlNode(
      directChild(element, "sub") as Element,
    )}}^{${renderOmmlNode(directChild(element, "sup") as Element)}}`;
  }
  if (name === "bar") return `\\overline{${renderOmmlNode(directChild(element, "e") as Element)}}`;
  return renderChildren();
}

export function ommlToLatex(omml: string): string {
  const document = new DOMParser().parseFromString(
    `<root xmlns:m="${MATH_NS}" xmlns:w="${WORD_NS}">${omml}</root>`,
    "application/xml",
  );
  const math = childElements(document.documentElement)[0];
  if (!math) return "";
  return renderOmmlNode(math)
    .replace(/π/g, "\\pi")
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "\\times ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function docxWithOmmlAsLatex(docxPath: string): Promise<Buffer> {
  const source = fs.readFileSync(docxPath);
  const archive = await JSZip.loadAsync(source);
  const documentFile = archive.file("word/document.xml");
  if (!documentFile) throw new Error("DOCX is missing word/document.xml");
  const xml = await documentFile.async("string");
  if (!xml.includes("<m:oMath")) return source;

  const converted = xml.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, (equation) => {
    const latex = ommlToLatex(equation);
    return `<w:r><w:t xml:space="preserve">$${escapeXmlText(latex)}$</w:t></w:r>`;
  });
  archive.file("word/document.xml", converted);
  return archive.generateAsync({ type: "nodebuffer" });
}

// Mammoth emits underline runs as <u> when configured with the style map below.
// Keep only those safe tags while flattening every other HTML formatting tag.
function stripHtmlPreservingUnderlines(html: string): string {
  return html
    .replace(/<u>/gi, UNDERLINE_OPEN)
    .replace(/<\/u>/gi, UNDERLINE_CLOSE)
    .replace(/<[^>]+>/g, " ")
    .replaceAll(UNDERLINE_OPEN, "<u>")
    .replaceAll(UNDERLINE_CLOSE, "</u>");
}

function tableToMarkdown(tableHtml: string): string {
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => {
    const cells = [...r[0].matchAll(/<t[hd][\s\S]*?<\/t[hd]>/gi)].map((c) =>
      decodeEntities(stripHtmlPreservingUnderlines(c[0])).replace(/\s+/g, " ").trim(),
    );
    return `| ${cells.join(" | ")} |`;
  });
  if (rows.length > 1) {
    const cols = (rows[0].match(/\|/g)?.length ?? 1) - 1; // markdown header-separator row
    rows.splice(1, 0, `| ${Array(cols).fill("---").join(" | ")} |`);
  }
  return rows.join(TABLE_ROWSEP);
}

function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => `\n${tableToMarkdown(t)}\n`)
    .replace(/<img[^>]*src="__IMG__([^"]+)__"[^>]*>/g, " [[IMG:$1]] ")
    .replace(/<\/(td|th)>/gi, " ") // table cells: separate, don't glue ("means.B." → "means. B.")
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<u>/gi, UNDERLINE_OPEN)
    .replace(/<\/u>/gi, UNDERLINE_CLOSE)
    .replace(/<[^>]+>/g, "")
    .replaceAll(UNDERLINE_OPEN, "<u>")
    .replaceAll(UNDERLINE_CLOSE, "</u>")
    .replace(/[ \t]{2,}/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim());
}

// Module headers may carry a leading ✅ ("✅RW Mod 1") or a trailing one.
const MODULE_RE = /^[^A-Za-z]*(RW|Math)\s*(Mod(?:ule)?\s*1|Mod(?:ule)?\s*2|2A|2B)\b/i;
// Question headers: optional leading ✅, optional "Review " prefix ("Review Question 18"),
// and an optional space before the number ("Question1").
const QUESTION_RE = /^[^A-Za-z]*(?:review\s+)?Question\s*(\d+)\b/i;
// Answer labels seen across forms: "Correct answer:", "Answer:", "SPR:",
// "Correct Answer:", "Correct answer/SPR (student produced response):".
// Tolerate label cruft between the lead word and the colon. If a prompt line
// matches by accident, the real answer line later in the block overwrites it.
const ANSWER_RE = /^(?:correct answer|answer|spr)[^:\n]{0,45}:\s*(.+)$/i;
const PAREN_RE = /\(([^)]+)\)/g;
// Split breadcrumb segments on en/em dash (any spacing) or a hyphen FOLLOWED by
// whitespace ("Rates- easy"). Internal hyphens ("problem-solving") are followed
// by a letter, so they survive.
const SEG_SPLIT_RE = /\s*[–—]\s*|\s*-\s+/;

const isSectionWord = (s: string) => /^(reading|writing|math)$/i.test(s.trim());

// A standalone breadcrumb line, for filtering it out of the passage. Some forms
// omit the leading section word (start at the domain), so also accept a
// parenthetical whose last dash-segment is a difficulty.
function isBreadcrumbLine(line: string): boolean {
  const t = line.trim();
  if (!(t.startsWith("(") && t.endsWith(")"))) return false;
  const inner = t.slice(1, -1);
  if (!/[–—-]/.test(inner)) return false;
  const segs = inner.split(SEG_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  return segs.length > 0 && (isSectionWord(segs[0]) || !!normalizeDifficulty(segs[segs.length - 1]));
}

function moduleFromHeader(header: string): Omit<ParsedModule, "questions"> | null {
  const m = header.match(MODULE_RE);
  if (!m) return null;
  const section: Section = /^rw/i.test(m[1]) ? "rw" : "math";
  const tag = m[2].toLowerCase().replace(/\s+/g, "");
  if (/2a/.test(tag)) return { section, order: 2, variant: "easy", label: header };
  if (/2b/.test(tag)) return { section, order: 2, variant: "hard", label: header };
  if (/mod(ule)?2/.test(tag)) return { section, order: 2, variant: null, label: header };
  return { section, order: 1, variant: null, label: header };
}

function parseBreadcrumb(block: string) {
  const out = { domain: null as string | null, skill: null as string | null, difficulty: null as Difficulty | null, found: false };
  // Pick the first parenthetical that looks like a breadcrumb: contains a dash
  // and either starts with a section word or ends with a difficulty.
  let chosen: string | null = null;
  for (const m of block.matchAll(PAREN_RE)) {
    const inner = m[1];
    if (!/[–—-]/.test(inner)) continue;
    const segs = inner.split(SEG_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
    if (!segs.length) continue;
    if (isSectionWord(segs[0]) || normalizeDifficulty(segs[segs.length - 1])) {
      chosen = inner;
      break;
    }
  }
  if (!chosen) return out;
  out.found = true;

  let parts = chosen.split(SEG_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  const maybeDiff = normalizeDifficulty(parts[parts.length - 1]);
  if (maybeDiff) {
    out.difficulty = maybeDiff;
    parts = parts.slice(0, -1);
  }
  if (parts.length && isSectionWord(parts[0])) parts = parts.slice(1); // drop section prefix when present
  // parts is now [domain?, ...skill] or [skill]
  if (parts.length >= 2) {
    const d = canonicalDomain(parts[0]);
    if (d) {
      out.domain = d;
      out.skill = parts.slice(1).join(" - ");
    } else {
      out.skill = parts.join(" - ");
      out.domain = domainForSkill(parts[parts.length - 1]);
    }
  } else if (parts.length === 1) {
    out.skill = parts[0];
    out.domain = canonicalDomain(parts[0]) ?? domainForSkill(parts[0]);
  }
  if (!out.domain && out.skill) out.domain = domainForSkill(out.skill);
  return out;
}

// A choice-start line: "A. text", "A) text", or a bare label "A" (content follows
// on later lines, e.g. systems-of-equations choices). NOT "A leak ..." (no delimiter).
function choiceLabel(line: string): { letter: string; inline: string } | null {
  // Labels appear upper- or lowercase across forms ("A. x" vs "a) x"); normalize.
  const m = line.match(/^([A-Da-d])[.)]\s*(.*)$/);
  if (m) return { letter: m[1].toUpperCase(), inline: m[2].trim() };
  if (/^[A-D]$/.test(line)) return { letter: line, inline: "" }; // bare label: uppercase only (avoid prose false positives)
  return null;
}

// A choice spread over several source lines is stacked content -- a system of
// equations, or one equation per row. Keep the rows as rows: collapse runs of
// spaces/tabs within a row, but never across the newline that separates them.
function joinChoiceParts(parts: string[]): string {
  return parts
    .map((part) => part.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Parse A–D choices from a question's body lines. Primary strategy is line-based
 * (handles "A. text" per line and bare-letter multi-line choices); falls back to
 * an inline regex for the rare "A. x B. y C. z D. w" all-on-one-line layout.
 * Returns the choices and the body-line index where they start (-1 if none / inline).
 */
function parseChoices(body: string[]): { choices: ParsedChoice[]; firstIdx: number } {
  const expected = ["A", "B", "C", "D"];
  const choices: ParsedChoice[] = [];
  let firstIdx = -1;
  let cur: { letter: string; parts: string[] } | null = null;
  let next = 0;
  for (let i = 0; i < body.length; i++) {
    const lab = choiceLabel(body[i]);
    if (lab && next < 4 && lab.letter === expected[next]) {
      if (cur) choices.push({ letter: cur.letter, text: joinChoiceParts(cur.parts) });
      cur = { letter: lab.letter, parts: lab.inline ? [lab.inline] : [] };
      if (firstIdx < 0) firstIdx = i;
      next++;
    } else if (cur) {
      cur.parts.push(body[i]);
    }
  }
  if (cur) choices.push({ letter: cur.letter, text: joinChoiceParts(cur.parts) });
  if (choices.length === 4) return { choices, firstIdx };

  // Fallback: all four choices inline on a single line.
  const joined = body.join("\n");
  const re = /(^|\s)([A-Da-d])[.)]\s+/g;
  const marks: { letter: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)))
    marks.push({ letter: m[2].toUpperCase(), index: m.index + m[1].length, end: re.lastIndex });
  const picked: typeof marks = [];
  for (const mk of marks) if (mk.letter === expected[picked.length]) picked.push(mk);
  if (picked.length !== 4) return { choices: [], firstIdx: -1 };
  const fc: ParsedChoice[] = [];
  for (let i = 0; i < 4; i++) {
    const start = picked[i].end;
    const stop = i < 3 ? picked[i + 1].index : joined.length;
    fc.push({ letter: picked[i].letter, text: joined.slice(start, stop).trim() });
  }
  return { choices: fc, firstIdx: -1 };
}

function normalizeAnswerValue(raw: string): string {
  return raw.replace(/[–—−]/g, "-").trim();
}

export function parseQuestionBlock(
  lines: string[],
  section: Section,
  pendingImages: string[],
  position: number,
): { question: ParsedQuestion; trailing: string[] } {
  const notes: string[] = [];
  const headerLine = lines[0];
  const rawNumber = Number(headerLine.match(QUESTION_RE)?.[1] ?? NaN);

  // Images before the answer belong to this question; images after the answer
  // (between this answer and the next "Question N") belong to the NEXT question.
  const figures = [...pendingImages];
  const trailing: string[] = [];
  let seenAnswer = false;
  const contentLines: string[] = [];
  let answerRaw: string | null = null;
  for (const raw of lines) {
    const imgs = [...raw.matchAll(/\[\[IMG:([^\]]+)\]\]/g)].map((x) => x[1]);
    const line = raw.replace(/\[\[IMG:[^\]]+\]\]/g, "").trim();
    const ans = line.match(ANSWER_RE);
    // Images on the answer line (or after it) belong to the NEXT question, not this one.
    (seenAnswer || ans ? trailing : figures).push(...imgs);
    if (ans) {
      answerRaw = ans[1].trim();
      seenAnswer = true;
      continue;
    }
    if (QUESTION_RE.test(line)) continue; // the "Question N" line itself
    if (line) contentLines.push(line);
  }

  const bc = parseBreadcrumb(lines.join("\n"));
  if (!bc.found) notes.push("no breadcrumb");
  if (bc.found && !bc.difficulty) notes.push("unrecognized difficulty");
  if (bc.found && !bc.domain) notes.push("domain not mapped");

  // drop the breadcrumb line from content
  const body = contentLines.filter(
    (l) => !isBreadcrumbLine(l) && !/^answer(?: choices?)?$/i.test(l.trim()),
  );
  const { choices, firstIdx } = parseChoices(body);

  let type: "mc" | "grid";
  let correct: string | null = null;
  let acceptedAnswers: string[] = [];
  if (choices.length === 4) {
    type = "mc";
    if (answerRaw) {
      const letter = answerRaw.match(/^[A-D]/i)?.[0]?.toUpperCase() ?? null;
      correct = letter;
      if (!letter) notes.push(`mc answer not a letter: "${answerRaw}"`);
    } else notes.push("no answer found");
  } else {
    type = "grid";
    if (answerRaw) acceptedAnswers = answerRaw.split(/\s+or\s+/i).map(normalizeAnswerValue);
    else notes.push("no answer found");
    if (choices.length > 0) notes.push(`partial choices parsed: ${choices.length}`);
  }

  // prompt = the line right before the choices; everything earlier is the stimulus.
  let prompt = "";
  let passage: string | null = null;
  if (type === "mc" && firstIdx >= 0) {
    const before = body.slice(0, firstIdx);
    prompt = before[before.length - 1] ?? "";
    passage = before.slice(0, -1).join("\n\n") || null;
  } else if (type === "mc") {
    // inline choices share a line with the prompt: split that line at "A."
    const li = body.findIndex((l) => /(^|\s)A[.)]\s+/.test(l));
    const line = li >= 0 ? body[li] : "";
    const idx = line.search(/(^|\s)A[.)]\s+/);
    prompt = (idx > 0 ? line.slice(0, idx) : line).trim();
    passage = body.slice(0, Math.max(0, li)).join("\n\n") || null;
  } else {
    prompt = body[body.length - 1] ?? "";
    passage = body.slice(0, -1).join("\n\n") || null;
  }
  if (!prompt) notes.push("empty prompt");

  const question: ParsedQuestion = {
    position,
    rawNumber: Number.isFinite(rawNumber) ? rawNumber : null,
    type,
    section,
    domain: bc.domain,
    skill: bc.skill,
    difficulty: bc.difficulty,
    passage,
    prompt,
    choices,
    correct,
    acceptedAnswers,
    figure: figures[0] ?? null,
    needsReview: notes.length > 0,
    notes,
  };
  return { question, trailing };
}

/** mammoth → ordered text lines (with `[[IMG:name]]` markers) + image buffers. */
export async function docxToContent(
  docxPath: string,
): Promise<{ lines: string[]; images: Map<string, { buffer: Buffer; contentType: string }> }> {
  const images = new Map<string, { buffer: Buffer; contentType: string }>();
  let n = 0;
  const input = await docxWithOmmlAsLatex(docxPath);
  const { value: html } = await mammoth.convertToHtml(
    { buffer: input },
    {
      // Underline is ignored by Mammoth unless it is explicitly mapped.
      // The runtime safely renders this exact <u>...</u> markup.
      styleMap: ["u => u"],
      convertImage: mammoth.images.imgElement(async (image) => {
        const b64 = await image.read("base64");
        const ext = (image.contentType?.split("/")[1] || "png").replace("jpeg", "jpg");
        const name = `image${++n}.${ext}`;
        images.set(name, {
          buffer: Buffer.from(b64, "base64"),
          contentType: image.contentType ?? "image/png",
        });
        return { src: `__IMG__${name}__` };
      }),
    },
  );

  // Word auto-numbered answer choices arrive as <ol><li>…</li></ol> with the
  // A/B/C/D markers dropped. Re-letter ordered-list items so parseChoices sees them.
  const lettered = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let i = 0;
    return inner.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_x: string, t: string) => `<p>${String.fromCharCode(65 + i++)}. ${t}</p>`,
    );
  });
  const lines = htmlToLines(lettered).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { lines, images };
}

/** Parse a .docx into structured modules + in-memory image buffers. No I/O. */
export async function parseDocx(docxPath: string): Promise<ParseResult> {
  const { lines, images } = await docxToContent(docxPath);

  // group lines into modules → question blocks
  const modules: ParsedModule[] = [];
  let current: ParsedModule | null = null;
  let blocks: string[][] = [];
  let block: string[] | null = null;
  let preambleImages: string[] = [];

  const flushBlock = () => {
    if (block && block.length) blocks.push(block);
    block = null;
  };
  const flushModule = () => {
    flushBlock();
    if (current) {
      let pos = 0;
      let carry: string[] = [];
      for (const b of blocks) {
        const { question, trailing } = parseQuestionBlock(b, current.section, carry, ++pos);
        current.questions.push(question);
        carry = trailing;
      }
      modules.push(current);
    }
    blocks = [];
  };

  for (const line of lines) {
    const mod = moduleFromHeader(line);
    if (mod) {
      flushModule();
      current = { ...mod, questions: [] };
      preambleImages = [];
      continue;
    }
    if (QUESTION_RE.test(line)) {
      flushBlock();
      block = [line];
      if (preambleImages.length) {
        block.unshift(...preambleImages.map((nm) => `[[IMG:${nm}]]`));
        preambleImages = [];
      }
      continue;
    }
    if (block) {
      block.push(line);
    } else {
      const imgs = [...line.matchAll(/\[\[IMG:([^\]]+)\]\]/g)].map((x) => x[1]);
      preambleImages.push(...imgs);
    }
  }
  flushModule();

  return { modules, images };
}

/** Print the per-module parse summary (counts, grid-ins, flagged questions). */
export function printReport(label: string, modules: ParsedModule[], imageCount: number): number {
  console.log(`\nParsed: ${label}`);
  console.log(`Images extracted: ${imageCount}`);
  console.log(`Modules: ${modules.length}\n`);
  let flagged = 0;
  for (const mod of modules) {
    const grids = mod.questions.filter((q) => q.type === "grid").length;
    const review = mod.questions.filter((q) => q.needsReview);
    flagged += review.length;
    console.log(
      `  ${mod.label.padEnd(12)} ${String(mod.questions.length).padStart(2)} Q  ` +
        `(${grids} grid-in)  ${review.length ? `⚠ ${review.length} flagged` : "✓"}`,
    );
    for (const q of review) {
      console.log(`      Q${q.rawNumber ?? "?"}: ${q.notes.join("; ")}`);
    }
  }
  console.log(`\nTotal flagged for review: ${flagged}`);
  return flagged;
}

// CLI entry — only runs when this file is executed directly, not when imported.
async function main() {
  const docxPath = process.argv[2];
  if (!docxPath) {
    console.error('Usage: tsx scripts/import/parse.ts "<path.docx>" [outDir]');
    process.exit(1);
  }
  const outDir = process.argv[3] ?? path.join(os.tmpdir(), "tpb-parsed");
  fs.mkdirSync(path.join(outDir, "images"), { recursive: true });
  const { modules, images } = await parseDocx(docxPath);
  for (const [name, img] of images) {
    fs.writeFileSync(path.join(outDir, "images", name), img.buffer);
  }
  fs.writeFileSync(path.join(outDir, "parsed.json"), JSON.stringify(modules, null, 2));
  printReport(path.basename(docxPath), modules, images.size);
  console.log(`Full output: ${path.join(outDir, "parsed.json")}`);
}

function isDirectRun(): boolean {
  try {
    return (
      !!process.argv[1] &&
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
