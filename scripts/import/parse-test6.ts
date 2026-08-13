/**
 * Parse and AI-enrich the alternate Practice Test 6 DOCX format.
 *
 *   npx tsx scripts/import/parse-test6.ts "<test-6.docx>" [outDir] [--enrich] [--cache=<path>]
 *
 * Unlike Tests 1-5, this document uses Title/Heading paragraphs for six modules,
 * bare `1)` question labels, supplied explanations, and trailing Topic/Difficulty
 * metadata. Parsing is deterministic; AI is limited to canonical SAT skill tags
 * and exact, validated LaTeX replacements.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import katex from "katex";
import { docxToContent } from "./parse";
import { canonicalDomain, normalizeDifficulty, type Difficulty } from "./taxonomy";

export type Test6Section = "rw" | "math";
export type Test6Variant = "easy" | "hard" | null;

export type Test6Choice = {
  letter: string;
  text: string;
  explanation: string | null;
};

export type Test6Question = {
  key: string;
  position: number;
  rawNumber: number;
  type: "mc" | "grid";
  section: Test6Section;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty | null;
  passage: string | null;
  prompt: string;
  choices: Test6Choice[];
  correct: string | null;
  acceptedAnswers: string[];
  figure: string | null;
  explanation: string | null;
  explanationSource: "human" | null;
  sourceTopic: string | null;
  sourceSubtopic: string | null;
  latexReplacementCount: number;
  needsReview: boolean;
  notes: string[];
};

export type Test6Module = {
  section: Test6Section;
  order: 1 | 2;
  variant: Test6Variant;
  label: string;
  questions: Test6Question[];
};

export type Test6ParseResult = {
  modules: Test6Module[];
  images: Map<string, { buffer: Buffer; contentType: string }>;
};

export const TEST6_SKILLS_BY_DOMAIN: Record<string, readonly string[]> = {
  "Information and Ideas": ["Central Ideas and Details", "Inferences", "Command of Evidence"],
  "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
  "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
  "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"],
  Algebra: [
    "Linear equations in one variable",
    "Linear equations in two variables",
    "Linear functions",
    "Systems of two linear equations in two variables",
    "Linear inequalities in one or two variables",
  ],
  "Advanced Math": [
    "Equivalent expressions",
    "Nonlinear equations in one variable and systems of equations in two variables",
    "Nonlinear functions",
  ],
  "Problem-Solving and Data Analysis": [
    "Ratios, rates, proportional relationships, and units",
    "Percentages",
    "One-variable data: distributions and measures of center and spread",
    "Two-variable data: models and scatterplots",
    "Probability and conditional probability",
    "Inference from sample statistics and margin of error",
    "Evaluating statistical claims: observational studies and experiments",
  ],
  "Geometry and Trigonometry": [
    "Area and volume",
    "Lines, angles, and triangles",
    "Right triangles and trigonometry",
    "Circles",
  ],
};

const EXPECTED_COUNTS: Record<string, number> = {
  "rw/1/m1": 27,
  "rw/2/easy": 27,
  "rw/2/hard": 27,
  "math/1/m1": 22,
  "math/2/easy": 22,
  "math/2/hard": 22,
};

const QUESTION_RE = /^(\d+)\)(?:\s*(.*))?$/;
const CHOICE_RE = /^([A-Da-d])[.)]\s*(.*)$/;
const TRAILING_CHOICE_ANSWER_RE = /\s+X\s*$/;
const IMAGE_RE = /\[\[IMG:([^\]]+)\]\]/g;
const RW_META_RE = /\s+(EASY|MEDIUM|HARD),\s*[A-Z][A-Z &/\-]*\s*$/i;
const RW_DIFFICULTY_ONLY_RE = /\s+(EASY|MEDIUM|HARD)\s*$/;
const RW_REVERSED_META_RE = /\s+[A-Z][A-Z &/\-]*,\s*(EASY|MEDIUM|HARD)\s*$/;
const RW_PLACEHOLDER_META_RE = /\s+DIFFICULTY,\s*TOPIC\s*$/;
const SOURCE_URL_RE = /^https?:\/\/\S+$/i;
const UNESCAPED_DOLLAR_RE = /(?<!\\)\$/g;
const MATH_SEGMENT_RE = /(?<!\\)\$([^$]+?)(?<!\\)\$/g;

type ReplacementField = "passage" | "prompt" | "explanation" | "choice";
type LatexReplacement = {
  field: ReplacementField;
  choiceLetter?: string;
  from: string;
  to: string;
};
type Enrichment = {
  domain: string;
  skill: string;
  replacements: LatexReplacement[];
};
type EnrichmentCache = Record<string, Enrichment>;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/[,&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function canonicalSkill(raw: string | null): string | null {
  if (!raw) return null;
  const target = normalize(raw)
    .replace(/\bin one or two variables\b/, "in one variable and systems of equations in two variables")
    .replace(/\bgeometry trigonometry\b/, "geometry and trigonometry");
  for (const skills of Object.values(TEST6_SKILLS_BY_DOMAIN)) {
    const skill = skills.find((candidate) => normalize(candidate) === target);
    if (skill) return skill;
  }
  return null;
}

function moduleKey(section: Test6Section, order: number, variant: Test6Variant): string {
  return `${section}/${order}/${variant ?? "m1"}`;
}

function questionKey(module: Test6Module, position: number): string {
  return `${moduleKey(module.section, module.order, module.variant)}/${position}`;
}

function moduleFromHeading(
  section: Test6Section,
  line: string,
): Omit<Test6Module, "section" | "label" | "questions"> | null {
  const normalized = line.toLowerCase().replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  if (
    normalized === "baseline" ||
    normalized === "baseline module" ||
    normalized === "module 1" ||
    normalized === "module 1 baseline"
  ) {
    return { order: 1, variant: null };
  }
  if (normalized === "easy" || normalized === "easy module" || normalized === "module 2 easy") {
    return { order: 2, variant: "easy" };
  }
  if (normalized === "hard" || normalized === "hard module" || normalized === "module 2 hard") {
    return { order: 2, variant: "hard" };
  }
  return null;
}

function extractImages(lines: string[]): { lines: string[]; figures: string[] } {
  const figures: string[] = [];
  const cleaned = lines
    .map((raw) => {
      for (const match of raw.matchAll(IMAGE_RE)) figures.push(match[1]);
      return raw.replace(IMAGE_RE, " ").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  return { lines: cleaned, figures };
}

function parseChoices(lines: string[]): {
  choices: Omit<Test6Choice, "explanation">[];
  firstIndex: number;
  markedAnswers: string[];
} {
  const choices: Omit<Test6Choice, "explanation">[] = [];
  const markedAnswers: string[] = [];
  let firstIndex = -1;
  let current: { letter: string; parts: string[] } | null = null;
  const pushCurrent = () => {
    if (!current) return;
    const rawText = current.parts.join(" ").trim();
    const marked = TRAILING_CHOICE_ANSWER_RE.test(rawText);
    choices.push({
      letter: current.letter,
      text: marked ? rawText.replace(TRAILING_CHOICE_ANSWER_RE, "").trim() : rawText,
    });
    if (marked) markedAnswers.push(current.letter);
  };
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(CHOICE_RE);
    if (match) {
      pushCurrent();
      current = { letter: match[1].toUpperCase(), parts: match[2] ? [match[2]] : [] };
      if (firstIndex < 0) firstIndex = index;
    } else if (current) {
      current.parts.push(lines[index]);
    }
  }
  pushCurrent();
  return { choices, firstIndex, markedAnswers };
}

function extractExplicitAnswer(lines: string[]): { lines: string[]; answer: string | null } {
  const index = lines.findIndex((line) => /^ANSWER(?:\s*:\s*.*)?\s*$/i.test(line));
  if (index < 0) return { lines, answer: null };

  const match = lines[index].match(/^ANSWER(?:\s*:\s*(.*))?\s*$/i);
  const inline = match?.[1]?.trim() ?? "";
  const answer = inline || lines[index + 1]?.trim() || null;
  const removeCount = inline || !lines[index + 1] ? 1 : 2;
  return {
    answer,
    lines: [...lines.slice(0, index), ...lines.slice(index + removeCount)],
  };
}

function choiceExplanations(explanation: string | null): Partial<Record<string, string>> {
  if (!explanation) return {};
  const starts = [...explanation.matchAll(/\bChoice\s+([A-D])\s+is\s+(?:the best answer|incorrect)\b/gi)].map(
    (match) => ({ letter: match[1].toUpperCase(), index: match.index ?? 0 }),
  );
  const result: Partial<Record<string, string>> = {};
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? explanation.length;
    result[start.letter] = explanation.slice(start.index, end).trim();
  }
  return result;
}

function normalizeAnswer(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/^\$|\$$/g, "")
    .trim();
}

function inferCorrectChoice(explanation: string | null): string | null {
  if (!explanation) return null;
  return explanation.match(/\bChoice\s+([A-D])\s+is\s+the best answer\b/i)?.[1]?.toUpperCase() ?? null;
}

function compactMathMetadata(
  line: string,
): { topic: string; subtopic: string; difficulty: Difficulty } | null {
  const difficultyMatch = line.match(/\s+(EASY|MEDIUM|HARD)\s*$/i);
  if (!difficultyMatch) return null;
  const difficulty = normalizeDifficulty(difficultyMatch[1]);
  if (!difficulty) return null;

  const body = line.slice(0, difficultyMatch.index).trim();
  const topics = [
    "Problem Solving & Data Analysis",
    "Problem-Solving and Data Analysis",
    "Geometry & Trigonometry",
    "Geometry and Trigonometry",
    "Advanced Math",
    "Algebra",
  ];
  const topic = topics.find((candidate) =>
    body.toLowerCase().startsWith(candidate.toLowerCase()),
  );
  if (!topic) return null;
  const subtopic = body.slice(topic.length).trim();
  return subtopic ? { topic, subtopic, difficulty } : null;
}

function parseQuestionBlock(block: string[], module: Test6Module, position: number): Test6Question {
  const header = block[0].match(QUESTION_RE);
  const rawNumber = Number(header?.[1] ?? position);
  const notes: string[] = [];
  if (rawNumber !== position) notes.push(`question number ${rawNumber} at position ${position}`);

  const inlineContent = header?.[2]?.trim();
  const { lines: withoutImages, figures } = extractImages([
    ...(inlineContent ? [inlineContent] : []),
    ...block.slice(1),
  ]);
  if (figures.length > 1) notes.push(`multiple figures found: ${figures.join(", ")}`);

  const explanationHeadingIndex = withoutImages.findIndex((line) => /^EXPLANATION$/i.test(line));
  const inlineExplanationIndex = withoutImages.findIndex((line) =>
    /^Choice\s+[A-D]\s+is\s+(?:the best answer|incorrect)\b/i.test(line),
  );
  const explanationIndex = explanationHeadingIndex >= 0 ? explanationHeadingIndex : inlineExplanationIndex;
  const explanationStart = explanationHeadingIndex >= 0 ? explanationIndex + 1 : explanationIndex;
  const beforeExplanation = (explanationIndex >= 0 ? withoutImages.slice(0, explanationIndex) : withoutImages).filter(
    (line) => !SOURCE_URL_RE.test(line),
  );
  const afterExplanation = (explanationIndex >= 0 ? withoutImages.slice(explanationStart) : []).filter(
    (line) => !SOURCE_URL_RE.test(line),
  );

  const compactMetadata = module.section === "math"
    ? [...withoutImages].reverse().map(compactMathMetadata).find(Boolean) ?? null
    : null;
  const sourceTopic =
    [...withoutImages].reverse().find((line) => /^Topic:/i.test(line))?.replace(/^Topic:\s*/i, "").trim() ??
    compactMetadata?.topic ??
    null;
  const sourceSubtopic =
    [...withoutImages].reverse().find((line) => /^Subtopic:/i.test(line))?.replace(/^Subtopic:\s*/i, "").trim() ??
    compactMetadata?.subtopic ??
    null;
  let difficulty = normalizeDifficulty(
    [...withoutImages].reverse().find((line) => /^Difficulty:/i.test(line))?.replace(/^Difficulty:\s*/i, "") ?? "",
  ) ?? compactMetadata?.difficulty ?? null;

  const isMetadata = (line: string) =>
    /^(?:Topic|Subtopic|Difficulty):/i.test(line) || Boolean(compactMathMetadata(line));
  const rawContent = beforeExplanation.filter((line) => !isMetadata(line));
  const explicitAnswer = extractExplicitAnswer(rawContent);
  const content = explicitAnswer.lines;
  const explanationLines = afterExplanation.filter((line) => !isMetadata(line));
  const explanation = explanationLines.join("\n\n").trim() || null;
  if (!explanation) notes.push("missing supplied explanation");

  if (module.section === "rw") {
    for (let index = content.length - 1; index >= 0; index--) {
      const placeholder = content[index].match(RW_PLACEHOLDER_META_RE);
      if (placeholder) {
        content[index] = content[index].slice(0, placeholder.index).trim();
        break;
      }
      const match =
        content[index].match(RW_META_RE) ??
        content[index].match(RW_REVERSED_META_RE) ??
        content[index].match(RW_DIFFICULTY_ONLY_RE);
      if (!match) continue;
      difficulty = normalizeDifficulty(match[1]);
      content[index] = content[index].slice(0, match.index).trim();
      break;
    }
  }
  if (!difficulty) notes.push("missing difficulty");

  const parsedChoices = parseChoices(content);
  const type = parsedChoices.choices.length === 4 ? "mc" : "grid";
  let prompt = "";
  let passage: string | null = null;
  let correct: string | null = null;
  let acceptedAnswers: string[] = [];

  if (type === "mc") {
    const stemLines = content.slice(0, parsedChoices.firstIndex);
    prompt = stemLines.pop()?.trim() ?? "";
    passage = stemLines.join("\n\n").trim() || null;
    const suppliedCorrect =
      explicitAnswer.answer?.match(/^[A-D]/i)?.[0]?.toUpperCase() ?? inferCorrectChoice(explanation);
    if (parsedChoices.markedAnswers.length > 1) {
      notes.push(`multiple choices marked correct: ${parsedChoices.markedAnswers.join(", ")}`);
    }
    const markedCorrect =
      parsedChoices.markedAnswers.length === 1 ? parsedChoices.markedAnswers[0] : null;
    correct = markedCorrect ?? suppliedCorrect;
    if (markedCorrect && suppliedCorrect && markedCorrect !== suppliedCorrect) {
      notes.push(`choice marker ${markedCorrect} conflicts with supplied answer ${suppliedCorrect}`);
    }
    if (!correct) notes.push("could not infer correct MC answer from explanation");
  } else {
    const stemLines = [...content];
    const rawAnswer = explicitAnswer.answer ?? (stemLines.length >= 2 ? stemLines.pop()?.trim() ?? null : null);
    if (rawAnswer) {
      acceptedAnswers = rawAnswer
        .split(/\s+or\s+/i)
        .map(normalizeAnswer)
        .filter(Boolean);
    }
    if (!acceptedAnswers.length) notes.push("missing grid-in answer");
    prompt = stemLines.pop()?.trim() ?? "";
    passage = stemLines.join("\n\n").trim() || null;
  }
  if (!prompt) notes.push("empty prompt");

  const perChoice = choiceExplanations(explanation);
  const domain = module.section === "math" && sourceTopic ? canonicalDomain(sourceTopic.replace(/&/g, "and")) : null;
  const skill = canonicalSkill(sourceSubtopic);
  if (domain && skill && !TEST6_SKILLS_BY_DOMAIN[domain]?.includes(skill)) {
    notes.push(`source subtopic does not belong to source topic: ${sourceSubtopic}`);
  }

  return {
    key: questionKey(module, position),
    position,
    rawNumber,
    type,
    section: module.section,
    domain,
    skill,
    difficulty,
    passage,
    prompt,
    choices: parsedChoices.choices.map((choice) => ({
      ...choice,
      explanation: perChoice[choice.letter] ?? null,
    })),
    correct,
    acceptedAnswers,
    figure: figures[0] ?? null,
    explanation,
    explanationSource: explanation ? "human" : null,
    sourceTopic,
    sourceSubtopic,
    latexReplacementCount: 0,
    needsReview: notes.length > 0,
    notes,
  };
}

export function parseTest6Lines(
  lines: string[],
  options: { initialSection?: Test6Section } = {},
): Test6Module[] {
  const modules: Test6Module[] = [];
  let section: Test6Section | null = options.initialSection ?? null;
  let current: Test6Module | null = null;
  let block: string[] | null = null;

  const flushBlock = () => {
    if (!current || !block?.length) {
      block = null;
      return;
    }
    current.questions.push(parseQuestionBlock(block, current, current.questions.length + 1));
    block = null;
  };
  const flushModule = () => {
    flushBlock();
    if (current) modules.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "Reading/Writing" || line === "Math") {
      flushModule();
      section = line === "Math" ? "math" : "rw";
      continue;
    }
    const moduleHeading = section ? moduleFromHeading(section, line) : null;
    if (section && moduleHeading) {
      flushModule();
      current = {
        section,
        ...moduleHeading,
        label: `${section === "rw" ? "Reading/Writing" : "Math"} — ${line}`,
        questions: [],
      };
      continue;
    }
    if (QUESTION_RE.test(line)) {
      flushBlock();
      block = [line];
      continue;
    }
    if (block) block.push(line);
  }
  flushModule();
  return modules;
}

export async function parseTest6Docx(
  docxPath: string,
  options: { initialSection?: Test6Section } = {},
): Promise<Test6ParseResult> {
  const { lines, images } = await docxToContent(docxPath);
  const modules = parseTest6Lines(lines, options);
  return { modules, images };
}

export const TEST6_ENRICHMENT_PROMPT = `
ROLE
You are a Digital SAT assessment taxonomist and mathematical typesetting editor.

INPUT
You receive parsed SAT questions with immutable prose, supplied answers/explanations, source topic hints, and an exact canonical taxonomy.

STEPS
1. Classify each question into exactly one allowed domain and one skill beneath that domain.
2. Find every expression that needs valid inline KaTeX, including equations, variables, functions, coordinates, exponents, roots, fractions, inequalities, scientific notation, and math inside tables.
3. Return exact find-and-replace edits. Include enough surrounding text in "from" to make each match unique when necessary.
4. Escape literal currency dollar signs as \\$ so they are never mistaken for math delimiters.

DO
- Use only the provided domain and skill strings, character-for-character.
- Preserve every word, answer, number, table marker, and explanation claim.
- Use single-dollar inline math only: $...$.
- Use KaTeX-compatible commands such as \\frac, \\sqrt, ^{...}, _{...}, \\le, and \\ge.
- Fix malformed source math when the intended expression is unambiguous from the question and supplied explanation.
- Return an empty replacements array when no changes are needed.

DON'T
- Do not generate or improve explanations.
- Do not paraphrase, summarize, correct facts, change answers, or reorder content.
- Do not use display math ($$...$$), Markdown, HTML, or Unicode equation substitutes.
- Do not classify passage subject matter (science/history/literature) as the SAT testing domain; classify the tested skill.
- Do not include a replacement whose "from" text is absent from the supplied field.
`.trim();

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function validateMathMarkup(value: string): string[] {
  const issues: string[] = [];
  const dollars = value.match(UNESCAPED_DOLLAR_RE)?.length ?? 0;
  if (dollars % 2 !== 0) issues.push("unbalanced LaTeX delimiters");
  if (value.includes("$$")) issues.push("display LaTeX is unsupported");
  if (value.includes("❑")) issues.push("unresolved equation placeholder");
  for (const match of value.matchAll(MATH_SEGMENT_RE)) {
    try {
      katex.renderToString(match[1], { throwOnError: true });
    } catch {
      issues.push(`invalid KaTeX: ${match[1]}`);
    }
  }
  return issues;
}

function getReplacementTarget(question: Test6Question, replacement: LatexReplacement): { value: string; set: (value: string) => void } | null {
  if (replacement.field === "passage") {
    if (question.passage == null) return null;
    return { value: question.passage, set: (value) => (question.passage = value) };
  }
  if (replacement.field === "prompt") {
    return { value: question.prompt, set: (value) => (question.prompt = value) };
  }
  if (replacement.field === "explanation") {
    if (question.explanation == null) return null;
    return { value: question.explanation, set: (value) => (question.explanation = value) };
  }
  const choice = question.choices.find((item) => item.letter === replacement.choiceLetter?.toUpperCase());
  return choice ? { value: choice.text, set: (value) => (choice.text = value) } : null;
}

function applyEnrichment(question: Test6Question, enrichment: Enrichment): void {
  const allowedSkills = TEST6_SKILLS_BY_DOMAIN[enrichment.domain];
  if (!allowedSkills?.includes(enrichment.skill)) {
    question.notes.push(`invalid AI taxonomy: ${enrichment.domain} / ${enrichment.skill}`);
    question.needsReview = true;
    return;
  }
  question.domain = enrichment.domain;
  question.skill = enrichment.skill;

  // Apply larger edits first so a specific sentence-level replacement can make
  // a later token-level replacement unique. Suggestions absent from the source
  // are harmless no-ops; they never mutate content and should not block import.
  const replacements = [...enrichment.replacements].sort(
    (a, b) => b.from.length - a.from.length,
  );
  for (const replacement of replacements) {
    const target = getReplacementTarget(question, replacement);
    if (!target) {
      question.notes.push(`invalid LaTeX replacement target: ${replacement.field}`);
      question.needsReview = true;
      continue;
    }
    const occurrences = countOccurrences(target.value, replacement.from);
    if (replacement.from === replacement.to) continue;
    if (!replacement.from) {
      question.notes.push(`unsafe LaTeX replacement (${replacement.field}, matches=${occurrences})`);
      question.needsReview = true;
      continue;
    }
    if (occurrences === 0) continue;
    if (occurrences !== 1) {
      question.notes.push(`unsafe LaTeX replacement (${replacement.field}, matches=${occurrences})`);
      question.needsReview = true;
      continue;
    }
    const issues = validateMathMarkup(replacement.to);
    if (issues.length) {
      question.notes.push(...issues.map((issue) => `${replacement.field}: ${issue}`));
      question.needsReview = true;
      continue;
    }
    target.set(target.value.replace(replacement.from, replacement.to));
    question.latexReplacementCount++;
  }

  const fields = [
    ["passage", question.passage],
    ["prompt", question.prompt],
    ["explanation", question.explanation],
    ...question.choices.map((choice) => [`choice ${choice.letter}`, choice.text] as const),
  ] as const;
  for (const [label, value] of fields) {
    if (!value) continue;
    const issues = validateMathMarkup(value);
    if (issues.length) {
      question.notes.push(...issues.map((issue) => `${label}: ${issue}`));
      question.needsReview = true;
    }
  }

  const perChoice = choiceExplanations(question.explanation);
  for (const choice of question.choices) choice.explanation = perChoice[choice.letter] ?? choice.explanation;
}

function enrichmentTool(): Tool {
  return {
    name: "enrich_test6_questions",
    description: "Return canonical SAT tags and exact LaTeX replacements for each supplied question.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string" },
              domain: { type: "string", enum: Object.keys(TEST6_SKILLS_BY_DOMAIN) },
              skill: { type: "string", enum: Object.values(TEST6_SKILLS_BY_DOMAIN).flat() },
              replacements: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    field: { type: "string", enum: ["passage", "prompt", "explanation", "choice"] },
                    choiceLetter: { type: "string", enum: ["A", "B", "C", "D"] },
                    from: { type: "string" },
                    to: { type: "string" },
                  },
                  required: ["field", "from", "to"],
                },
              },
            },
            required: ["key", "domain", "skill", "replacements"],
          },
        },
      },
      required: ["results"],
    },
  };
}

async function enrichBatch(
  anthropic: Anthropic,
  model: string,
  questions: Test6Question[],
): Promise<Record<string, Enrichment>> {
  const input = questions.map((question) => ({
    key: question.key,
    section: question.section,
    sourceTopic: question.sourceTopic,
    sourceSubtopic: question.sourceSubtopic,
    difficulty: question.difficulty,
    passage: question.passage,
    prompt: question.prompt,
    choices: question.choices.map(({ letter, text }) => ({ letter, text })),
    acceptedAnswers: question.acceptedAnswers,
    explanation: question.explanation,
    hasFigure: Boolean(question.figure),
  }));
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: TEST6_ENRICHMENT_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ taxonomy: TEST6_SKILLS_BY_DOMAIN, questions: input }),
      },
    ],
    tools: [enrichmentTool()],
    tool_choice: { type: "tool", name: "enrich_test6_questions" },
  });
  const block = response.content.find((item) => item.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("AI did not return enrichment tool output");
  const payload = block.input as { results?: Array<{ key?: string; domain?: string; skill?: string; replacements?: LatexReplacement[] }> };
  const result: Record<string, Enrichment> = {};
  for (const item of payload.results ?? []) {
    if (!item.key || !item.domain || !item.skill || !Array.isArray(item.replacements)) continue;
    result[item.key] = { domain: item.domain, skill: item.skill, replacements: item.replacements };
  }
  return result;
}

async function pool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export async function enrichTest6Questions(
  modules: Test6Module[],
  options: { apiKey: string; model?: string; cachePath?: string; batchSize?: number; concurrency?: number },
): Promise<void> {
  const cachePath = options.cachePath;
  const cache: EnrichmentCache = cachePath && fs.existsSync(cachePath)
    ? (JSON.parse(fs.readFileSync(cachePath, "utf8")) as EnrichmentCache)
    : {};
  const questions = modules.flatMap((module) => module.questions);
  const missing = questions.filter((question) => !cache[question.key]);
  const batchSize = options.batchSize ?? 4;
  const batches: Test6Question[][] = [];
  for (let index = 0; index < missing.length; index += batchSize) batches.push(missing.slice(index, index + batchSize));

  if (missing.length && !options.apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Test 6 tags and LaTeX normalization");
  }
  const anthropic = new Anthropic({ apiKey: options.apiKey });
  const model = options.model ?? "claude-opus-4-8";
  let completed = 0;
  await pool(batches, options.concurrency ?? 3, async (batch) => {
    const enriched = await enrichBatch(anthropic, model, batch);
    for (const question of batch) {
      const result = enriched[question.key];
      if (!result) throw new Error(`AI omitted enrichment for ${question.key}`);
      cache[question.key] = result;
    }
    if (cachePath) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    }
    completed += batch.length;
    console.log(`  AI enrichment ${completed}/${missing.length}`);
  });

  for (const question of questions) {
    const enrichment = cache[question.key];
    if (!enrichment) throw new Error(`Missing enrichment cache entry for ${question.key}`);
    applyEnrichment(question, enrichment);
  }
}

export function auditTest6(result: Test6ParseResult): {
  questionCount: number;
  imageCount: number;
  referencedImages: number;
  tableCount: number;
  explanationCount: number;
  taggedCount: number;
  latexReplacementCount: number;
  flagged: Test6Question[];
  errors: string[];
} {
  const questions = result.modules.flatMap((module) => module.questions);
  const referenced = questions.map((question) => question.figure).filter((figure): figure is string => Boolean(figure));
  const textFields = questions.flatMap((question) => [question.passage, question.prompt, question.explanation]);
  const tableCount = textFields.filter((value) => value?.includes("@@ROW@@")).length;
  const errors: string[] = [];
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const testModule = result.modules.find((item) => moduleKey(item.section, item.order, item.variant) === key);
    if (!testModule) errors.push(`missing module ${key}`);
    else if (testModule.questions.length !== expected) errors.push(`${key}: expected ${expected}, parsed ${testModule.questions.length}`);
  }
  if (result.modules.length !== 6) errors.push(`expected 6 modules, parsed ${result.modules.length}`);
  if (new Set(referenced).size !== referenced.length) errors.push("an image is attached to more than one question");
  for (const name of result.images.keys()) if (!referenced.includes(name)) errors.push(`unreferenced image ${name}`);
  for (const name of referenced) if (!result.images.has(name)) errors.push(`missing extracted image ${name}`);
  return {
    questionCount: questions.length,
    imageCount: result.images.size,
    referencedImages: referenced.length,
    tableCount,
    explanationCount: questions.filter((question) => question.explanation).length,
    taggedCount: questions.filter((question) => question.domain && question.skill).length,
    latexReplacementCount: questions.reduce((sum, question) => sum + question.latexReplacementCount, 0),
    flagged: questions.filter((question) => question.needsReview),
    errors,
  };
}

export function printTest6Report(
  result: Test6ParseResult,
  label = "Practice Test 6",
): ReturnType<typeof auditTest6> {
  const audit = auditTest6(result);
  console.log(`\n${label} parse report`);
  for (const testModule of result.modules) {
    const flagged = testModule.questions.filter((question) => question.needsReview).length;
    console.log(`  ${testModule.label.padEnd(28)} ${String(testModule.questions.length).padStart(2)} questions  ${flagged ? `⚠ ${flagged}` : "✓"}`);
  }
  console.log(`Questions: ${audit.questionCount}`);
  console.log(`Images: ${audit.referencedImages}/${audit.imageCount}`);
  console.log(`Tables: ${audit.tableCount}`);
  console.log(`Supplied explanations: ${audit.explanationCount}/${audit.questionCount}`);
  console.log(`AI tags: ${audit.taggedCount}/${audit.questionCount}`);
  console.log(`LaTeX replacements: ${audit.latexReplacementCount}`);
  for (const question of audit.flagged) console.log(`  ⚠ ${question.key}: ${question.notes.join("; ")}`);
  for (const error of audit.errors) console.log(`  ✗ ${error}`);
  return audit;
}

async function main() {
  const args = process.argv.slice(2);
  const enrich = args.includes("--enrich");
  const cacheArg = args.find((arg) => arg.startsWith("--cache="));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const docxPath = positional[0];
  if (!docxPath) {
    console.error('Usage: tsx scripts/import/parse-test6.ts "<test-6.docx>" [outDir] [--enrich] [--cache=<path>]');
    process.exit(1);
  }
  const outDir = positional[1] ?? path.join(os.tmpdir(), "test6-parsed");
  const result = await parseTest6Docx(docxPath);
  if (enrich) {
    await enrichTest6Questions(result.modules, {
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      model: process.env.TEST6_ENRICH_MODEL,
      cachePath: cacheArg?.slice("--cache=".length),
    });
  }
  fs.mkdirSync(path.join(outDir, "images"), { recursive: true });
  for (const [name, image] of result.images) fs.writeFileSync(path.join(outDir, "images", name), image.buffer);
  fs.writeFileSync(path.join(outDir, "parsed.json"), JSON.stringify(result.modules, null, 2));
  const audit = printTest6Report(result);
  if (audit.errors.length) process.exitCode = 1;
  console.log(`Output: ${outDir}`);
}

function isDirectRun(): boolean {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
