import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import type { Highlight } from "@/lib/sat/highlights";

export const DENSE_READING_SLUG = "dense-reading";
export const ROUND_SIZE = 11;
export const CHOICES: ChoiceId[] = ["A", "B", "C", "D"];
export type ReadingMode = "guided" | "regular";
export type ReadingTopic =
  | "structure"
  | "function"
  | "cross-text"
  | "main-idea"
  | "details"
  | "evidence"
  | "graphs"
  | "inference";
export type ReadingQuestion = {
  id: string;
  topic: ReadingTopic;
  difficulty: Difficulty;
  passage: string;
  prompt: string;
  figureUrl: string | null;
  choices: { id: ChoiceId; text: string }[];
};
export type ReadingKey = ReadingQuestion & {
  correct: ChoiceId;
  explanation: string;
};
export type Flag = "red" | "green" | "neutral";
export const STEPS = [
  "preview",
  "round",
  "question",
  "topic",
  "passage",
  "figure",
  "prediction",
  "flags",
  "order",
  "crossout",
  "choice",
  "confidence",
  "select",
  "done",
] as const;
export type ReadingStep = (typeof STEPS)[number];
export type ReadingProgress = {
  step: ReadingStep;
  round: 1 | 2 | 3 | null;
  previewMs: number;
  segment: number;
  prediction: string;
  flags: Partial<Record<ChoiceId, Flag>>;
  flagsChecked: boolean;
  order: ChoiceId[];
  choiceIndex: number;
  word: number;
  deferred: boolean;
  eliminated: ChoiceId[];
  answer: ChoiceId | null;
  submitted: boolean;
  skipped: boolean;
  marked: boolean;
  highlights: Highlight[];
  elapsedMs: number;
  stepMs: Partial<Record<ReadingStep, number>>;
  segmentMs: number[];
  wordMs: Partial<Record<ChoiceId, number[]>>;
};
export type ReadingState = {
  version: 1;
  current: number;
  review: boolean;
  crossOut: boolean;
  elapsedMs: number;
  attemptOrder: string[];
  progress: ReadingProgress[];
  changes: number;
};
export type ReadingResult = {
  questionId: string;
  answer: ChoiceId | null;
  correctAnswer: ChoiceId;
  correct: boolean;
  explanation: string;
};
export type ReadingSession = {
  id: string;
  mode: ReadingMode;
  status: "active" | "completed";
  createdAt: string;
  completedAt: string | null;
  revision: number;
  questions: ReadingQuestion[];
  state: ReadingState;
  results: ReadingResult[] | null;
};
export type ReadingHistory = Pick<
  ReadingSession,
  "id" | "mode" | "status" | "createdAt" | "completedAt"
> & { correct: number; total: number; elapsedMs: number };
