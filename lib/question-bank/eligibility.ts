import { isDifficulty } from "@/lib/sat/types";
import { isMathDomain } from "@/lib/question-bank/math";
import { isReadingWritingDomain } from "@/lib/question-bank/reading-writing";

export type QuestionBankShape = {
  drillSlug: string;
  section: string | null;
  answerType: string;
};

export function isQuestionBankEligibleShape(question: QuestionBankShape): boolean {
  return (
    (question.drillSlug === "grammar"
      && question.section === "rw"
      && question.answerType === "mc_single")
    || (question.drillSlug === "targeted-math"
      && question.section === "math"
      && (question.answerType === "mc_single" || question.answerType === "grid_in"))
  );
}

export type QuestionBankContentShape = QuestionBankShape & {
  domain: string | null;
  skill: string | null;
  difficulty: string;
  stem: string | null;
  passage: string | null;
  content: Record<string, unknown> | null;
};

const CHOICE_IDS = ["A", "B", "C", "D"] as const;

export function questionBankPublishabilityIssue(
  question: QuestionBankContentShape,
): string | null {
  if (!isQuestionBankEligibleShape(question)) {
    return "Question Bank items must be Grammar Reading & Writing multiple-choice or Targeted Math multiple-choice/grid-in questions.";
  }
  if (!question.skill?.trim()) return "Choose a Question Bank skill.";
  if (!isDifficulty(question.difficulty)) return "Choose a valid Question Bank difficulty.";

  if (question.drillSlug === "grammar") {
    if (!isReadingWritingDomain(question.domain)) return "Choose a valid Reading & Writing domain.";
    if (!question.passage?.trim()) return "Add the Reading & Writing passage.";
    if (!question.stem?.trim()) return "Add the Reading & Writing question prompt.";
    return multipleChoiceIssue(question.content);
  }

  if (!isMathDomain(question.domain)) return "Choose a valid Math domain.";
  if (!question.stem?.trim() && !question.passage?.trim()) return "Add the Math question prompt.";
  if (question.answerType === "mc_single") return multipleChoiceIssue(question.content);
  return gridInIssue(question.content);
}

export function isQuestionBankRuntimeReady(question: QuestionBankContentShape): boolean {
  return questionBankPublishabilityIssue(question) === null;
}

function multipleChoiceIssue(content: Record<string, unknown> | null): string | null {
  const choices = Array.isArray(content?.choices) ? content.choices : [];
  if (choices.length !== CHOICE_IDS.length) return "Add exactly four answer choices (A–D).";
  const ids = new Set<string>();
  for (const choice of choices) {
    if (
      !isRecord(choice)
      || !isChoiceId(choice.id)
      || typeof choice.text !== "string"
      || !choice.text.trim()
    ) {
      return "Every answer choice must have a unique A–D label and nonblank text.";
    }
    ids.add(choice.id);
  }
  if (ids.size !== CHOICE_IDS.length) return "Every answer choice must have a unique A–D label.";
  if (!isChoiceId(content?.correct) || !ids.has(content.correct)) {
    return "Select a valid correct answer.";
  }
  return null;
}

function gridInIssue(content: Record<string, unknown> | null): string | null {
  const accepted = Array.isArray(content?.accepted)
    ? content.accepted.filter((answer): answer is string => typeof answer === "string" && answer.trim() !== "")
    : [];
  return accepted.length > 0 ? null : "Add at least one accepted grid-in answer.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChoiceId(value: unknown): value is (typeof CHOICE_IDS)[number] {
  return CHOICE_IDS.some((id) => id === value);
}
