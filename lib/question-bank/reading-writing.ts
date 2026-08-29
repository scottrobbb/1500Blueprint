import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import type { QuestionBankLevel, QuestionBankLevelBreakdown } from "@/lib/question-bank/math";

export const READING_WRITING_DOMAINS = [
  "Craft and Structure",
  "Expression of Ideas",
  "Information and Ideas",
  "Standard English Conventions",
] as const;

export const READING_WRITING_SKILLS = [
  "Cross-Text Connections",
  "Text Structure and Purpose",
  "Words in Context",
  "Rhetorical Synthesis",
  "Transitions",
  "Central Ideas and Details",
  "Command of Evidence",
  "Inferences",
  "Boundaries",
  "Form, Structure, and Sense",
] as const;

export type ReadingWritingDomain = (typeof READING_WRITING_DOMAINS)[number];
export type ReadingWritingDifficultyFilter = Difficulty | "all";
export type ReadingWritingCompletionFilter = "all" | "unanswered" | "attempted";

export type ReadingWritingChoice = {
  id: ChoiceId;
  text: string;
};

export type ReadingWritingSkillMetric = {
  domain: ReadingWritingDomain;
  name: string;
  sort: number;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
  byLevel: QuestionBankLevelBreakdown;
};

export type ReadingWritingBankCatalog = {
  totalAvailable: number;
  totalAttempted: number;
  skills: ReadingWritingSkillMetric[];
};

export type ReadingWritingRunnerQuestion = {
  id: string;
  domain: ReadingWritingDomain;
  skill: string;
  difficulty: Difficulty;
  level: QuestionBankLevel;
  answerType: "mc_single";
  prompt: string;
  passage: string | null;
  figureUrl: string | null;
  choices: ReadingWritingChoice[];
};

export type ReadingWritingAttemptResult = {
  correct: boolean;
  explanation: string;
  correctAnswer: string;
};

export function isReadingWritingDomain(value: string | null): value is ReadingWritingDomain {
  return READING_WRITING_DOMAINS.some((domain) => domain === value);
}
