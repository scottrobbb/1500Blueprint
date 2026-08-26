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

export function isCoursePracticeQuestionComplete(question: CoursePracticeQuestion): boolean {
  if (!question.correctAnswer.trim()) return false;
  if (question.type === "multiple_choice") {
    const choices = question.choices.map((choice) => choice.trim()).filter(Boolean);
    return choices.length >= 2 && choices.some((choice) => normalizeCoursePracticeAnswer(choice) === normalizeCoursePracticeAnswer(question.correctAnswer));
  }
  return true;
}

export function gradeCoursePractice(practice: CoursePractice, answers: CoursePracticeAnswer[]): CoursePracticeGrade {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  const results: Record<string, boolean> = {};
  let correctCount = 0;
  for (const question of practice.questions) {
    const correct = normalizeCoursePracticeAnswer(answerMap.get(question.id) ?? "") === normalizeCoursePracticeAnswer(question.correctAnswer);
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
    choices: type === "multiple_choice" ? ["", "", "", ""] : [],
    correctAnswer: "",
    explanation: "",
  };
}
