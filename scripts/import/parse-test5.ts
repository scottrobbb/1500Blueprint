import { docxToContent, parseQuestionBlock } from "./parse";
import { parseTest6Lines, TEST6_SKILLS_BY_DOMAIN, type Test6Module, type Test6ParseResult, type Test6Question } from "./parse-test6";

const MATH_HEADER = /^Math\s+Mod(?:ule)?\s+([12])(?:\s+(Easy|Hard))?\b/i;
const QUESTION_HEADER = /^Question\s*(\d+)\b/i;
const RW_HEADER = /^(\d+)\)(?:\s+([A-Z][A-Z ,/\-]*))?$/;

function cleanSourceLine(line: string): string | null {
  line = line.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const plain = line.replace(/<\/?u>/g, "").trim();
  if (/^https?:\/\//i.test(plain)) return null;
  return line.replace(/\s+(EASY|MEDIUM|HARD)\s+(HUMANITIES|SCIENCE|SOCIAL STUDIES)\s*$/, " $1, $2");
}

function readingSkill(question: Test6Question, heading: string): string {
  const prompt = question.prompt;
  if (/logical and precise|most nearly mean/.test(prompt)) return "Words in Context";
  if (/main purpose|overall structure|function of the underlined/.test(prompt)) return "Text Structure and Purpose";
  if (/Based on the texts/.test(prompt)) return "Cross-Text Connections";
  if (/most logically completes/.test(prompt)) return "Inferences";
  if (/transition/.test(prompt)) return "Transitions";
  if (/information from the notes/.test(prompt)) return "Rhetorical Synthesis";
  if (/conventions of Standard English/.test(prompt)) {
    const stems = question.choices.map((choice) => choice.text.toLowerCase()
      .replace(/\b(?:and|yet|while|that)\b/g, "").replace(/[^a-z]/g, ""));
    return /PUNCTUATING|DEPENDENT|QUESTION/.test(heading) || new Set(stems).size === 1
      ? "Boundaries" : "Form, Structure, and Sense";
  }
  if (/COMMAND/.test(heading) || /claim|quotation|graph|table/.test(prompt)) return "Command of Evidence";
  if (/main idea|Based on the text|According to the text|What does the text suggest/.test(prompt)) return "Central Ideas and Details";
  throw new Error(`Unclassified R&W question: ${question.key}`);
}

function mathSkill(raw: string | null, domain: string | null): string {
  const aliases: Record<string, string> = {
    "linear equations in one var": "Linear equations in one variable",
    "linear equations in two var": "Linear equations in two variables",
    "nonlinear equations in one variable": "Nonlinear equations in one variable and systems of equations in two variables",
    "right angles and trig": "Right triangles and trigonometry",
    "right triangles and trig": "Right triangles and trigonometry",
    "evaluating statistical claims": "Evaluating statistical claims: observational studies and experiments",
    "one-variable data: distributions and measures of center": "One-variable data: distributions and measures of center and spread",
    "rates": "Ratios, rates, proportional relationships, and units",
    "ratios, rates, and proportional relationships": "Ratios, rates, proportional relationships, and units",
  };
  const normalized = raw?.toLowerCase().trim() ?? "";
  const skill = aliases[normalized] ?? TEST6_SKILLS_BY_DOMAIN[domain ?? ""]?.find((value) => value.toLowerCase() === normalized);
  if (!skill) throw new Error(`Unknown Math skill: ${raw}`);
  return skill;
}

export function parseTest5Lines(sourceLines: string[]): Test6Module[] {
  const lines = sourceLines.map(cleanSourceLine).filter((line): line is string => line !== null);
  const mathStart = lines.findIndex((line) => MATH_HEADER.test(line));
  if (mathStart < 0) throw new Error("The document has no Math modules");
  const headings: string[] = [];
  const readingLines = lines.slice(0, mathStart).map((line) => {
    if (/^Reading\/Writing(?:\s*\(PV\))?$/.test(line)) return "Reading/Writing";
    const header = line.match(RW_HEADER);
    if (!header) return line;
    headings.push(header[2] ?? "");
    return `${header[1]})`;
  });
  const modules = parseTest6Lines(readingLines);
  let headingIndex = 0;
  for (const testModule of modules) {
    for (const question of testModule.questions) {
      const heading = headings[headingIndex++];
      question.skill = readingSkill(question, heading);
      question.domain = Object.entries(TEST6_SKILLS_BY_DOMAIN).find(([, skills]) => skills.includes(question.skill!))?.[0] ?? null;
      question.sourceSubtopic = heading || question.skill;
      // Keep the source's bulleted research notes as separate bullets in the runner.
      if (question.passage?.startsWith("While researching a topic")) {
        const [intro, ...notes] = question.passage.split("\n\n");
        question.passage = [intro, ...notes.map((note) => `• ${note}`)].join("\n\n");
      }
    }
  }

  let current: Test6Module | null = null;
  let block: string[] = [];
  const flushQuestion = () => {
    if (!current || block.length === 0) return;
    const joinedAnswers = block.flatMap((line, index) => {
      if (/^(?:Correct answer|Answer|SPR):\s*$/i.test(line)) return [`${line} ${block[index + 1] ?? ""}`];
      if (index > 0 && /^(?:Correct answer|Answer|SPR):\s*$/i.test(block[index - 1])) return [];
      return [line];
    });
    const position = current.questions.length + 1;
    const { question, trailing } = parseQuestionBlock(joinedAnswers, "math", [], position);
    if (trailing.length) throw new Error("Unexpected image after a Math answer");
    if (question.rawNumber !== position) throw new Error(`Math question numbering mismatch at ${position}`);
    current.questions.push({
      ...question,
      rawNumber: position,
      key: `math/${current.order}/${current.variant ?? "m1"}/${position}`,
      skill: mathSkill(question.skill, question.domain),
      choices: question.choices.map((choice) => ({ ...choice, explanation: null })),
      explanation: null,
      explanationSource: null,
      sourceTopic: question.domain,
      sourceSubtopic: question.skill,
      latexReplacementCount: 0,
    });
    block = [];
  };
  for (const line of lines.slice(mathStart)) {
    const header = line.match(MATH_HEADER);
    if (header) {
      flushQuestion();
      const order = Number(header[1]) as 1 | 2;
      const variant = header[2]?.toLowerCase() as "easy" | "hard" | undefined;
      if (order === 2 && !variant) throw new Error("Math module 2 requires an Easy or Hard label");
      current = { section: "math", order, variant: variant ?? null, label: line, questions: [] };
      modules.push(current);
    } else if (QUESTION_HEADER.test(line)) {
      flushQuestion();
      block = [line];
    } else if (block.length) block.push(line);
  }
  flushQuestion();
  return modules;
}

export async function parseTest5Docx(file: string): Promise<Test6ParseResult> {
  const { lines, images } = await docxToContent(file);
  const modules = parseTest5Lines(lines);
  const expected = ["rw/1/m1", "rw/2/easy", "rw/2/hard", "math/1/m1", "math/2/easy", "math/2/hard"];
  if (modules.length !== expected.length) throw new Error("Expected six adaptive modules");
  for (const [index, testModule] of modules.entries()) {
    if (`${testModule.section}/${testModule.order}/${testModule.variant ?? "m1"}` !== expected[index]
      || testModule.questions.length !== (testModule.section === "rw" ? 27 : 22)) throw new Error(`Invalid module ${testModule.label}`);
    for (const question of testModule.questions) {
      if (question.notes.length || !question.domain || !question.skill || !question.difficulty) {
        throw new Error(`${question.key}: ${question.notes.join(", ")} / missing metadata`);
      }
      if (question.type === "mc" && (question.choices.length !== 4 || !question.correct)) throw new Error(`Invalid choices: ${question.key}`);
      if (question.type === "grid" && !question.acceptedAnswers.length) throw new Error(`Missing answer: ${question.key}`);
    }
  }
  const referenced = modules.flatMap((testModule) => testModule.questions.flatMap((question) => question.figure ? [question.figure] : []));
  if (referenced.length !== 6 || images.size !== 6 || referenced.some((name) => !images.has(name)) || new Set(referenced).size !== 6) {
    throw new Error("Expected six source figures, each attached to exactly one question");
  }
  return { modules, images };
}
