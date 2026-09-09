import {
  CHOICES,
  STEPS,
  type ReadingKey,
  type ReadingMode,
  type ReadingQuestion,
  type ReadingResult,
  type ReadingState,
} from "./types";
import { initialProgress } from "./state";
import type { ChoiceId } from "@/lib/sat/types";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function choice(value: unknown): value is ChoiceId {
  return CHOICES.includes(value as ChoiceId);
}
function milliseconds(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 604_800_000
  )
    throw new Error("Invalid reading time");
  return Math.round(value);
}
function times(value: unknown, max: number): number[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Invalid timing history");
  return value.map(milliseconds);
}
function index(value: unknown, max: number): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > max
  )
    throw new Error("Invalid reading position");
  return value as number;
}
function ids(value: unknown): ChoiceId[] {
  if (
    !Array.isArray(value) ||
    value.length > 4 ||
    !value.every(choice) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid choice order");
  return value;
}

export function validateReadingState(
  value: unknown,
  questions: ReadingQuestion[],
  mode: ReadingMode,
  previous?: ReadingState,
): ReadingState {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.progress) ||
    value.progress.length !== questions.length
  )
    throw new Error("Invalid reading session");
  if (
    !Array.isArray(value.attemptOrder) ||
    value.attemptOrder.length > questions.length ||
    value.attemptOrder.some((id) => !questions.some((q) => q.id === id))
  )
    throw new Error("Invalid attempt order");
  const progress = value.progress.map((raw: unknown, i) => {
    if (!record(raw) || !STEPS.includes(raw.step as never))
      throw new Error("Invalid reading step");
    if (
      raw.round !== null &&
      raw.round !== 1 &&
      raw.round !== 2 &&
      raw.round !== 3
    )
      throw new Error("Invalid confidence round");
    if (
      typeof raw.prediction !== "string" ||
      raw.prediction.length > 4000 ||
      (raw.answer !== null && !choice(raw.answer))
    )
      throw new Error("Invalid answer");
    if (
      !Array.isArray(raw.highlights) ||
      raw.highlights.length > 200 ||
      !record(raw.flags) ||
      !record(raw.stepMs) ||
      !record(raw.wordMs)
    )
      throw new Error("Invalid reading annotations");
    const p = initialProgress(mode);
    p.step = raw.step as typeof p.step;
    p.round = raw.round;
    p.previewMs = Math.min(5000, milliseconds(raw.previewMs));
    p.segment = index(raw.segment, 10_000);
    p.prediction = raw.prediction;
    p.order = ids(raw.order);
    p.choiceIndex = index(raw.choiceIndex, Math.max(0, p.order.length - 1));
    p.word = index(raw.word, 5000);
    p.eliminated = ids(raw.eliminated);
    p.answer = raw.answer;
    p.submitted = raw.submitted === true;
    if (p.submitted && !p.answer)
      throw new Error("A submitted answer is required");
    p.skipped = raw.skipped === true || previous?.progress[i].skipped === true;
    p.marked = raw.marked === true;
    p.flagsChecked = raw.flagsChecked === true;
    p.deferred = raw.deferred === true;
    for (const id of CHOICES) {
      const flag = raw.flags[id];
      if (
        flag !== undefined &&
        flag !== "red" &&
        flag !== "green" &&
        flag !== "neutral"
      )
        throw new Error("Invalid flag");
      if (flag) p.flags[id] = flag;
      if (raw.wordMs[id] !== undefined)
        p.wordMs[id] = times(raw.wordMs[id], 5000);
    }
    for (const step of STEPS)
      if (raw.stepMs[step] !== undefined)
        p.stepMs[step] = milliseconds(raw.stepMs[step]);
    p.elapsedMs = milliseconds(raw.elapsedMs);
    p.segmentMs = times(raw.segmentMs, 10_000);
    p.highlights = raw.highlights.map((h: unknown) => {
      if (
        !record(h) ||
        typeof h.id !== "string" ||
        h.id.length > 100 ||
        !["#fde68a", "#bfdbfe", "#fbcfe8", "underline"].includes(
          String(h.color),
        )
      )
        throw new Error("Invalid highlight");
      const start = index(h.start, questions[i].passage.length);
      const end = index(h.end, questions[i].passage.length);
      if (
        end <= start ||
        (h.note !== undefined &&
          (typeof h.note !== "string" || h.note.length > 2000))
      )
        throw new Error("Invalid highlight range");
      return {
        id: h.id,
        start,
        end,
        color: String(h.color),
        ...(typeof h.note === "string" ? { note: h.note } : {}),
      };
    });
    const old = previous?.progress[i];
    if (
      mode === "guided" &&
      old?.submitted &&
      (!p.submitted || p.answer !== old.answer)
    )
      throw new Error("Guided answers cannot be changed after submission");
    return p;
  });
  return {
    version: 1,
    current: index(value.current, questions.length - 1),
    review: value.review === true,
    crossOut: value.crossOut === true,
    elapsedMs: milliseconds(value.elapsedMs),
    attemptOrder: [...new Set(value.attemptOrder as string[])],
    progress,
    changes: index(value.changes ?? 0, 1_000_000),
  };
}

export function gradeReading(
  questions: ReadingKey[],
  state: ReadingState,
): ReadingResult[] {
  return questions.map((q, i) => ({
    questionId: q.id,
    answer: state.progress[i].answer,
    correctAnswer: q.correct,
    correct: state.progress[i].answer === q.correct,
    explanation: q.explanation,
  }));
}

export function publicReadingQuestion(q: ReadingKey): ReadingQuestion {
  return {
    id: q.id,
    topic: q.topic,
    difficulty: q.difficulty,
    passage: q.passage,
    prompt: q.prompt,
    figureUrl: q.figureUrl,
    choices: q.choices.map(({ id, text }) => ({ id, text })),
  };
}
