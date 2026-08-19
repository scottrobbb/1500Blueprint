import * as path from "node:path";
import {
  docxToContent,
  parseQuestionBlock,
  type ParsedQuestion,
} from "./parse";
import {
  MATH_SKILLS,
  canonicalDomain,
  canonicalSkill,
} from "../seed-drills/skills";

export type MathBankDifficulty = "easy" | "medium" | "hard";

export type MathBankFigure = {
  buffer: Buffer;
  contentType: string;
};

export type ParsedMathBankQuestion = ParsedQuestion & {
  domain: string;
  skill: string;
  difficulty: MathBankDifficulty;
  sourcePath: string;
  sourceFile: string;
  sourceOrdinal: number;
  figureData: MathBankFigure | null;
};

export type ParsedMathBankDocument = {
  sourcePath: string;
  expectedCount: number | null;
  questions: ParsedMathBankQuestion[];
  warnings: string[];
};

type SourceMetadata = {
  sourcePath: string;
  sourceFile: string;
  domain: string | null;
  skill: string | null;
  difficulty: MathBankDifficulty | null;
  expectedCount: number | null;
};

type ImageMap = Map<string, MathBankFigure>;

const ANSWER_LINE_RE = /^(?:correct answer|answer|spr)[^:\n]{0,45}:\s*(.+)$/i;
const EMBEDDED_ANSWER_RE = /\b(?:correct answer|answer|spr)[^:\n]{0,45}:\s*.+$/i;
const QUESTION_LINE_RE = /^[^A-Za-z]*(?:(?:review|corrected)\s+)?question\b/i;
const TABLE_ROW_SEPARATOR = "@@ROW@@";

const SKILL_DOMAIN = new Map<string, string>([
  ...MATH_SKILLS.slice(0, 5).map((skill) => [skill, "Algebra"] as const),
  ...MATH_SKILLS.slice(5, 8).map((skill) => [skill, "Advanced Math"] as const),
  ...MATH_SKILLS.slice(8, 15).map((skill) => [skill, "Problem-Solving and Data Analysis"] as const),
  ...MATH_SKILLS.slice(15).map((skill) => [skill, "Geometry and Trigonometry"] as const),
]);

export async function parseMathBankDocx(
  docxPath: string,
  sourcePath: string,
): Promise<ParsedMathBankDocument> {
  const { lines, images } = await docxToContent(docxPath);
  return parseMathBankLines(lines, sourcePath, images);
}

export function parseMathBankLines(
  sourceLines: string[],
  sourcePath: string,
  images: ImageMap = new Map(),
): ParsedMathBankDocument {
  const metadata = parseSourceMetadata(sourcePath);
  const lines = normalizeLiteralHtml(sourceLines)
    .map(normalizeAnswerLabel)
    .flatMap(splitEmbeddedAnswer);
  const { blocks, inferredAnswerBlocks } = splitQuestionBlocks(lines);
  const questions: ParsedMathBankQuestion[] = [];

  blocks.forEach((rawBlock, index) => {
    const sourceOrdinal = index + 1;
    const inferredAnswer = inferredAnswerBlocks.has(index);
    const originalNumber = findQuestionNumber(rawBlock);
    const { lines: block, skill: blockSkill } = prepareBlock(rawBlock);
    const parsed = parseQuestionBlock(
      [`Question ${sourceOrdinal}`, ...block],
      "math",
      [],
      sourceOrdinal,
    ).question;
    parsed.rawNumber = originalNumber;
    const prompt = [parsed.passage, parsed.prompt].filter(Boolean).join("\n\n");

    const parsedSkill = canonicalSkill(parsed.skill);
    const skill = parsedSkill ?? blockSkill ?? metadata.skill;
    const domain = (skill ? SKILL_DOMAIN.get(skill) : null)
      ?? canonicalDomain(parsed.domain)
      ?? metadata.domain;
    const difficulty = parsed.difficulty ?? metadata.difficulty;
    const notes = parsed.notes.filter((note) => ![
      "no breadcrumb",
      "unrecognized difficulty",
      "domain not mapped",
    ].includes(note));

    if (inferredAnswer) notes.push("answer label inferred from final source line");
    if (!skill) notes.push("skill not mapped");
    if (!domain) notes.push("domain not mapped");
    if (!difficulty) notes.push("difficulty not mapped");
    if (parsed.type === "mc" && parsed.choices.length !== 4) notes.push("multiple-choice item does not have four choices");
    if (parsed.type === "mc" && !parsed.correct) notes.push("multiple-choice item has no answer key");
    if (parsed.type === "grid" && parsed.acceptedAnswers.length === 0) notes.push("student-produced response has no answer key");

    const figureData = parsed.figure ? images.get(parsed.figure) ?? null : null;
    if (parsed.figure && !figureData) notes.push(`figure ${parsed.figure} was not extracted`);

    if (!skill || !domain || !difficulty) return;
    questions.push({
      ...parsed,
      passage: null,
      prompt,
      domain,
      skill,
      difficulty,
      acceptedAnswers: parsed.acceptedAnswers.flatMap(expandAcceptedAnswers),
      needsReview: notes.length > 0,
      notes: [...new Set(notes)],
      sourcePath: metadata.sourcePath,
      sourceFile: metadata.sourceFile,
      sourceOrdinal,
      figureData,
    });
  });

  const warnings: string[] = [];
  if (metadata.expectedCount !== null && questions.length !== metadata.expectedCount) {
    warnings.push(`expected ${metadata.expectedCount} questions from filename, parsed ${questions.length}`);
  }

  return {
    sourcePath,
    expectedCount: metadata.expectedCount,
    questions,
    warnings,
  };
}

function splitQuestionBlocks(lines: string[]): {
  blocks: string[][];
  inferredAnswerBlocks: Set<number>;
} {
  const blocks: string[][] = [];
  const inferredAnswerBlocks = new Set<number>();
  let block: string[] = [];

  const pushBlock = (inferred = false) => {
    const trimmed = trimEmptyLines(block);
    block = [];
    const substantive = hasQuestionContent(trimmed);
    if (!substantive) return;
    if (inferred) inferredAnswerBlocks.add(blocks.length);
    blocks.push(trimmed);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (isNoiseLine(line)) continue;
    if (!line && block.length === 0) continue;
    if (block.length > 0 && isQuestionStart(line) && hasQuestionContent(block)) {
      const last = block[block.length - 1];
      const inferred = looksLikeUnlabeledAnswer(last);
      if (inferred) block[block.length - 1] = `Correct Answer: ${last}`;
      pushBlock(inferred);
    }
    block.push(line);
    if (ANSWER_LINE_RE.test(line)) {
      pushBlock();
    }
  }

  block = trimEmptyLines(block);
  if (block.length > 0) {
    const last = block[block.length - 1];
    if (
      looksLikeUnlabeledAnswer(last)
      && block.some((line) => QUESTION_LINE_RE.test(line) || isBreadcrumbStart(line))
    ) {
      block[block.length - 1] = `Correct Answer: ${last}`;
      pushBlock(true);
    } else {
      pushBlock();
    }
  }

  return { blocks, inferredAnswerBlocks };
}

function splitEmbeddedAnswer(line: string): string[] {
  const match = line.match(EMBEDDED_ANSWER_RE);
  if (!match || match.index === undefined || match.index === 0) return [line];
  const before = line.slice(0, match.index).trim();
  const answer = line.slice(match.index).trim();
  return before ? [before, answer] : [answer];
}

function normalizeAnswerLabel(line: string): string {
  const match = line.match(/^(correct answer|answer|spr)\s+(.+)$/i);
  return match ? `${match[1]}: ${match[2]}` : line;
}

function isQuestionStart(line: string): boolean {
  if (QUESTION_LINE_RE.test(line)) return true;
  if (/^\([^)]*(?:easy|medium|hard|challenge)\s*\)$/i.test(line)) return true;
  return line.length < 120 && canonicalSkill(line) !== null;
}

function hasQuestionContent(lines: string[]): boolean {
  return lines.some((line) =>
    !ANSWER_LINE_RE.test(line)
    && !QUESTION_LINE_RE.test(line)
    && !/^\[\[IMG:/.test(line)
    && !isBreadcrumbStart(line)
    && !(line.length < 120 && canonicalSkill(line) !== null)
    && !isNoiseLine(line),
  );
}

function isBreadcrumbStart(line: string): boolean {
  return /^\([^)]*(?:easy|medium|hard|challenge)\s*\)$/i.test(line);
}

function isNoiseLine(line: string): boolean {
  return !line
    || /^[\s\-–—_=]{3,}$/.test(line)
    || /^(?:math|reading|writing)$/i.test(line)
    || /^now,\s*\d+\s+additional\b/i.test(line)
    || /^[‘’'"`]+$/.test(line);
}

function prepareBlock(rawBlock: string[]): { lines: string[]; skill: string | null } {
  let skill: string | null = null;
  const lines: string[] = [];

  for (const rawLine of rawBlock) {
    const line = rawLine.trim();
    if (!line) continue;
    if (QUESTION_LINE_RE.test(line)) {
      const breadcrumbAt = line.indexOf("(");
      if (breadcrumbAt >= 0) {
        const breadcrumb = line.slice(breadcrumbAt).replace(/:\s*$/, "");
        if (isBreadcrumbStart(breadcrumb)) lines.push(breadcrumb);
      }
      continue;
    }
    if (/^(?:answer|rationale|spr|student-produced response(?:\s*\(spr\))?)$/i.test(line)) continue;
    if (/^difficulty\s*:\s*(?:easy|medium|hard|challenge)$/i.test(line)) continue;
    if (lines.length === 0 && !line.startsWith("(") && !line.startsWith("[[IMG:") && !/[?.:]$/.test(line)) {
      const headingSkill = canonicalSkill(line);
      if (headingSkill) {
        skill = headingSkill;
        continue;
      }
    }
    lines.push(line);
  }

  return { lines, skill };
}

function normalizeLiteralHtml(lines: string[]): string[] {
  const normalized: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^<table>$/i.test(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && !/^<\/table>$/i.test(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index++;
      }
      const table = literalHtmlTableToMarkdown(tableLines.join(""));
      if (table) normalized.push(table);
      continue;
    }
    normalized.push(stripLiteralParagraph(line));
  }
  return normalized;
}

function literalHtmlTableToMarkdown(html: string): string {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/gi)]
      .map((cell) => stripLiteralParagraph(cell[1]).replace(/\|/g, "\\|").trim()),
  ).filter((row) => row.length > 0);
  if (rows.length === 0) return "";
  const markdown = [
    `| ${rows[0].join(" | ")} |`,
    `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ];
  return markdown.join(TABLE_ROW_SEPARATOR);
}

function stripLiteralParagraph(line: string): string {
  return line
    .replace(/^<p>/i, "")
    .replace(/<\/p>$/i, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .trim();
}

function parseSourceMetadata(sourcePath: string): SourceMetadata {
  const parts = sourcePath.split("/").filter(Boolean);
  const sourceFile = parts.at(-1) ?? path.basename(sourcePath);
  const difficultyFolder = parts.at(-2) ?? "";
  const skillFolder = parts.at(-3) ?? "";
  const domainFolder = parts.at(-4) ?? "";
  const expectedMatch = sourceFile.match(/\((\d+)\s*Qs?\)/i);
  const difficulty = normalizeDifficulty(difficultyFolder)
    ?? (/challenge/i.test(sourceFile) ? "hard" : null);
  const skill = canonicalSkill(cleanFolderLabel(skillFolder));
  const domain = canonicalSourceDomain(cleanFolderLabel(domainFolder));

  return {
    sourcePath,
    sourceFile,
    difficulty,
    skill,
    domain,
    expectedCount: expectedMatch ? Number(expectedMatch[1]) : null,
  };
}

function cleanFolderLabel(value: string): string {
  return value
    .replace(/✅/g, "")
    .replace(/_[^_]*_/g, "")
    .replace(/\s*\(\d+\s*Qs?\).*$/i, "")
    .replace(/_/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalSourceDomain(value: string): string | null {
  if (/^problem solving$/i.test(value)) return "Problem-Solving and Data Analysis";
  if (/^geometry$/i.test(value)) return "Geometry and Trigonometry";
  return canonicalDomain(value);
}

function normalizeDifficulty(value: string): MathBankDifficulty | null {
  const normalized = value.toLowerCase().trim();
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") return normalized;
  return normalized === "challenge" ? "hard" : null;
}

function expandAcceptedAnswers(value: string): string[] {
  const trimmed = value.trim();
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    return [trimmed.replace(/,/g, "")];
  }
  return trimmed
    .split(/\s*,\s*/)
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function findQuestionNumber(lines: string[]): number | null {
  for (const line of lines) {
    const match = line.match(/question\s*(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function looksLikeUnlabeledAnswer(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\d+\/\d+)$/.test(value.trim());
}

function trimEmptyLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}
