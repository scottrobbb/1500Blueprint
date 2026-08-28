import type { CoursePractice, CoursePracticeQuestion } from "./types";

export type CoursePracticeAnswer = {
  questionId: string;
  answer: string;
};

export type CoursePracticeGrade = {
  score: number;
  correctCount: number;
  questionCount: number;
  passed: boolean;
  results: Record<string, boolean>;
};

export type SavedCoursePracticeAttempt = {
  id: string;
  score: number;
  correctCount: number;
  questionCount: number;
  passed: boolean;
  completedAt: string;
  attemptCount: number;
  bestScore: number;
};

export function normalizeCoursePracticeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// "checkbox" questions store/submit multiple selected choices as a single
// string (the CoursePracticeAnswer/DB shape only supports one string per
// question) joined by "\n", which choice text can't itself contain since
// choices are edited in single-line inputs.
const CHECKBOX_ANSWER_DELIMITER = "\n";

export function serializeCheckboxAnswer(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(CHECKBOX_ANSWER_DELIMITER);
}

export function parseCheckboxAnswer(value: string): string[] {
  return value.split(CHECKBOX_ANSWER_DELIMITER).map((entry) => entry.trim()).filter(Boolean);
}

function normalizedCheckboxSet(value: string): string[] {
  return parseCheckboxAnswer(value).map(normalizeCoursePracticeAnswer).sort();
}

export function isCheckboxChoiceCorrect(question: CoursePracticeQuestion, choice: string): boolean {
  return normalizedCheckboxSet(question.correctAnswer).includes(normalizeCoursePracticeAnswer(choice));
}

export function isCoursePracticeAnswerCorrect(question: CoursePracticeQuestion, given: string): boolean {
  if (question.type === "checkbox") {
    const correct = normalizedCheckboxSet(question.correctAnswer);
    const submitted = normalizedCheckboxSet(given);
    return correct.length > 0 && correct.length === submitted.length && correct.every((value, index) => value === submitted[index]);
  }
  const normalizedGiven = normalizeCoursePracticeAnswer(given);
  return [question.correctAnswer, ...(question.acceptedAnswers ?? [])].some((accepted) => normalizeCoursePracticeAnswer(accepted) === normalizedGiven);
}

export function isCoursePracticeQuestionComplete(question: CoursePracticeQuestion): boolean {
  if (!question.correctAnswer.trim()) return false;
  if (question.type === "multiple_choice" || question.type === "checkbox") {
    const choices = question.choices.map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) return false;
    if (question.type === "checkbox") {
      const correct = normalizedCheckboxSet(question.correctAnswer);
      return correct.length > 0 && correct.every((value) => choices.some((choice) => normalizeCoursePracticeAnswer(choice) === value));
    }
    return choices.some((choice) => normalizeCoursePracticeAnswer(choice) === normalizeCoursePracticeAnswer(question.correctAnswer));
  }
  return true;
}

export function gradeCoursePractice(practice: CoursePractice, answers: CoursePracticeAnswer[]): CoursePracticeGrade {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  const results: Record<string, boolean> = {};
  let correctCount = 0;
  for (const question of practice.questions) {
    const correct = isCoursePracticeAnswerCorrect(question, answerMap.get(question.id) ?? "");
    results[question.id] = correct;
    if (correct) correctCount += 1;
  }
  const questionCount = practice.questions.length;
  const score = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;
  return { score, correctCount, questionCount, passed: questionCount > 0 && score >= practice.passingScore, results };
}

export function emptyCoursePractice(title = "New practice"): CoursePractice {
  return {
    title,
    instructions: "Answer each question, check your work, and review the explanation before continuing.",
    passingScore: 100,
    randomizeQuestions: false,
    questions: [],
  };
}

export function emptyCoursePracticeQuestion(type: CoursePracticeQuestion["type"]): CoursePracticeQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    prompt: "",
    choices: type === "multiple_choice" || type === "checkbox" ? ["", "", "", ""] : [],
    correctAnswer: "",
    acceptedAnswers: [],
    explanation: "",
  };
}
