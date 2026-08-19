import type { ChoiceId, Difficulty } from "@/lib/sat/types";

export const MATH_DOMAINS = [
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
] as const;

export type MathDomain = (typeof MATH_DOMAINS)[number];
export type MathDifficultyFilter = Difficulty | "all";
export type MathCompletionFilter = "all" | "unanswered" | "attempted";
export type MathAnswerType = "mc_single" | "grid_in";

export type MathChoice = {
  id: ChoiceId;
  text: string;
};

export type MathSkillMetric = {
  domain: MathDomain;
  name: string;
  sort: number;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
};

export type MathBankCatalog = {
  totalAvailable: number;
  totalAttempted: number;
  skills: MathSkillMetric[];
};

export type MathRunnerQuestion = {
  id: string;
  domain: MathDomain;
  skill: string;
  difficulty: Difficulty;
  answerType: MathAnswerType;
  prompt: string;
  passage: string | null;
  figureUrl: string | null;
  choices: MathChoice[];
};

export type MathAttemptResult = {
  correct: boolean;
  explanation: string;
  correctAnswer: string;
};

export function isMathDomain(value: string | null): value is MathDomain {
  return MATH_DOMAINS.some((domain) => domain === value);
}

export function parseDifficultyFilter(value: string | undefined): MathDifficultyFilter {
  return value === "easy" || value === "medium" || value === "hard" ? value : "all";
}

export function parseCompletionFilter(value: string | undefined): MathCompletionFilter {
  return value === "unanswered" || value === "attempted" ? value : "all";
}

export function parseSkillFilter(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split("|").map((skill) => skill.trim()).filter(Boolean))];
}

export function normalizeMathResponse(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/^\+/, "");
}

export function calculateAccuracy(correct: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((correct / attempts) * 100);
}

export function formatDifficulty(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
