import * as path from "node:path";
import {
  docxToContent,
  parseQuestionBlock,
  type ParsedQuestion,
} from "./parse";
import {
  RW_SKILLS,
  canonicalDomain,
  canonicalSkill,
} from "../seed-drills/skills";

export type ReadingBankDifficulty = "easy" | "medium" | "hard";

export type ReadingBankFigure = {
  buffer: Buffer;
  contentType: string;
};

export type ParsedReadingBankQuestion = ParsedQuestion & {
  domain: string;
  skill: string;
  difficulty: ReadingBankDifficulty;
  explanation: string;
  sourcePath: string;
  sourceFile: string;
  sourceOrdinal: number;
  figureData: ReadingBankFigure | null;
};

export type ParsedReadingBankDocument = {
  sourcePath: string;
  expectedCount: number | null;
  questions: ParsedReadingBankQuestion[];
  warnings: string[];
};

type ImageMap = Map<string, ReadingBankFigure>;

const QUESTION_RE = /^(?:review\s+)?question\s*(\d+)\b/i;
const ANSWER_RE = /^(?:correct\s+answer|answer)\s*:?\s*(.+)$/i;
const EXPLANATION_RE = /^(?:explanation|rationale)\s*:?\s*(.*)$/i;
const RW_DOMAINS = [
  "Craft and Structure",
  "Expression of Ideas",
  "Information and Ideas",
  "Standard English Conventions",
] as const;

export async function parseReadingBankDocx(
  docxPath: string,
  sourcePath: string,
): Promise<ParsedReadingBankDocument> {
  const { lines, images } = await docxToContent(docxPath);
  return parseReadingBankLines(lines, sourcePath, images);
}

export function parseReadingBankLines(
  sourceLines: string[],
  sourcePath: string,
  images: ImageMap = new Map(),
): ParsedReadingBankDocument {
  const metadata = parseSourceMetadata(sourcePath);
  const blocks = splitQuestionBlocks(sourceLines);
  const questions: ParsedReadingBankQuestion[] = [];

  blocks.forEach((block, index) => {
    const sourceOrdinal = index + 1;
    const answerIndex = block.findIndex((line) => ANSWER_RE.test(line.trim()));
    const explanationIndex = block.findIndex((line) => EXPLANATION_RE.test(line.trim()));
    const explanation = readExplanation(block, answerIndex, explanationIndex);
    const inferredAnswer = explanation.match(/\bchoice\s+([A-D])\s+is\s+the\s+best\s+answer\b/i)?.[1]?.toUpperCase();
    const answerLine = answerIndex >= 0
      ? block[answerIndex].trim()
      : inferredAnswer
        ? `Answer: ${inferredAnswer}`
        : "";
    const contentEnd = answerIndex >= 0
      ? answerIndex
      : explanationIndex >= 0
        ? explanationIndex
        : block.length;
    const content = block.slice(0, contentEnd);
    const parsed = parseQuestionBlock(
      [...content, answerLine || "Answer:"],
      "rw",
      [],
      sourceOrdinal,
    ).question;
    const notes = parsed.notes.filter((note) => ![
      "no breadcrumb",
      "unrecognized difficulty",
      "domain not mapped",
    ].includes(note));

    if (parsed.type !== "mc") notes.push("reading and writing item is not multiple choice");
    if (parsed.choices.length !== 4) notes.push("multiple-choice item does not have four choices");
    if (!parsed.correct) notes.push("multiple-choice item has no answer key");
    if (!explanation) notes.push("question has no explanation");
    if (
      parsed.choices.length > 0
      && new Set(parsed.choices.map((choice) => normalizeChoiceText(choice.text))).size !== parsed.choices.length
    ) notes.push("multiple-choice item has duplicate choice text");

    const figureData = parsed.figure ? images.get(parsed.figure) ?? null : null;
    if (parsed.figure && !figureData) notes.push(`figure ${parsed.figure} was not extracted`);

    if (!metadata.domain || !metadata.skill || !metadata.difficulty) return;
    const passage = parsed.passage?.trim() || parsed.prompt.trim();
    const prompt = parsed.passage?.trim()
      ? parsed.prompt.trim()
      : defaultPrompt(metadata.skill);
    questions.push({
      ...parsed,
      passage,
      prompt,
      rawNumber: readQuestionNumber(block),
      domain: metadata.domain,
      skill: metadata.skill,
      difficulty: metadata.difficulty,
      explanation,
      needsReview: notes.length > 0,
      notes: [...new Set(notes)],
      sourcePath,
      sourceFile: path.basename(sourcePath),
      sourceOrdinal,
      figureData,
    });
  });

  const warnings: string[] = [];
  if (metadata.expectedCount !== null && questions.length !== metadata.expectedCount) {
    warnings.push(`expected ${metadata.expectedCount} questions from source path, parsed ${questions.length}`);
  }
  if (!metadata.domain) warnings.push("domain not mapped from source path");
  if (!metadata.skill) warnings.push("skill not mapped from source path");
  if (!metadata.difficulty) warnings.push("difficulty not mapped from source path");

  return { sourcePath, expectedCount: metadata.expectedCount, questions, warnings };
}

function splitQuestionBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (QUESTION_RE.test(line)) {
      if (current.length > 0) blocks.push(trimEmpty(current));
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(trimEmpty(current));
  return blocks.filter((block) => block.length > 1);
}

function readExplanation(lines: string[], answerIndex: number, explanationIndex: number): string {
  const start = explanationIndex >= 0 ? explanationIndex : answerIndex >= 0 ? answerIndex + 1 : -1;
  if (start < 0) return "";
  const first = explanationIndex >= 0
    ? lines[explanationIndex].match(EXPLANATION_RE)?.[1]?.trim() ?? ""
    : lines[start]?.trim() ?? "";
  return [first, ...lines.slice(start + 1)]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function parseSourceMetadata(sourcePath: string): {
  domain: string | null;
  skill: string | null;
  difficulty: ReadingBankDifficulty | null;
  expectedCount: number | null;
} {
  const normalized = normalizePath(sourcePath);
  const domain = RW_DOMAINS.find((name) => normalized.includes(normalizePath(name))) ?? null;
  const skill = RW_SKILLS.find((name) => normalized.includes(normalizePath(name))) ?? null;
  const difficulty = /(?:^|[\s/_-])easy(?:[\s/_.(-]|$)/.test(normalized)
    ? "easy"
    : /(?:^|[\s/_-])medium(?:[\s/_.(-]|$)/.test(normalized)
      ? "medium"
      : /(?:^|[\s/_-])(?:hard|challenge)(?:[\s/_.(-]|$)/.test(normalized)
        ? "hard"
        : null;
  const countMatches = [...sourcePath.matchAll(/\((\d+)\s*Qs?\)/gi)];
  const expectedCount = countMatches.length > 0
    ? Number(countMatches[countMatches.length - 1][1])
    : null;

  return {
    domain: canonicalDomain(domain),
    skill: canonicalSkill(skill),
    difficulty,
    expectedCount,
  };
}

function defaultPrompt(skill: string): string {
  if (skill === "Boundaries" || skill === "Form, Structure, and Sense") {
    return "Which choice completes the text so that it conforms to the conventions of Standard English?";
  }
  if (skill === "Words in Context") {
    return "Which choice completes the text with the most logical and precise word or phrase?";
  }
  if (skill === "Transitions") {
    return "Which choice completes the text with the most logical transition?";
  }
  return "Which choice best answers the question?";
}

function readQuestionNumber(lines: string[]): number | null {
  const value = lines[0]?.match(QUESTION_RE)?.[1];
  return value ? Number(value) : null;
}

function normalizePath(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChoiceText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function trimEmpty(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}
