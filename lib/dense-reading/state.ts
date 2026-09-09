import type { ChoiceId } from "@/lib/sat/types";
import { segmentCount, suggestedOrder, wordCount } from "./method";
import {
  CHOICES,
  type Flag,
  type ReadingMode,
  type ReadingProgress,
  type ReadingQuestion,
  type ReadingState,
} from "./types";

export function initialProgress(mode: ReadingMode): ReadingProgress {
  return {
    step: mode === "guided" ? "preview" : "select",
    round: null,
    previewMs: 0,
    segment: 0,
    prediction: "",
    flags: {},
    flagsChecked: false,
    order: [],
    choiceIndex: 0,
    word: 0,
    deferred: false,
    eliminated: [],
    answer: null,
    submitted: false,
    skipped: false,
    marked: false,
    highlights: [],
    elapsedMs: 0,
    stepMs: {},
    segmentMs: [],
    wordMs: {},
  };
}
export function initialReadingState(
  count: number,
  mode: ReadingMode,
): ReadingState {
  return {
    version: 1,
    current: 0,
    review: false,
    crossOut: false,
    elapsedMs: 0,
    attemptOrder: [],
    progress: Array.from({ length: count }, () => initialProgress(mode)),
    changes: 0,
  };
}

export type ReadingAction =
  | { type: "time"; ms: number }
  | {
      type:
        | "next"
        | "solve"
        | "skip"
        | "review"
        | "crossout"
        | "uncertain"
        | "mark";
    }
  | { type: "round"; round: 1 | 2 | 3 }
  | { type: "prediction"; text: string }
  | { type: "flag"; choice: ChoiceId; flag: Flag }
  | { type: "order"; order: ChoiceId[] }
  | { type: "decide"; keep: boolean }
  | { type: "answer"; choice: ChoiceId }
  | { type: "eliminate"; choice: ChoiceId }
  | { type: "goto"; index: number }
  | { type: "highlights"; highlights: ReadingProgress["highlights"] };

export function canNavigate(state: ReadingState, mode: ReadingMode): boolean {
  return (
    mode === "regular" ||
    state.review ||
    ["preview", "done"].includes(state.progress[state.current].step)
  );
}

export function advanceReading(
  state: ReadingState,
  action: ReadingAction,
  questions: ReadingQuestion[],
  mode: ReadingMode,
): ReadingState {
  const question = questions[state.current];
  if (!question) return state;
  const p: ReadingProgress = { ...state.progress[state.current] };
  const next: ReadingState = {
    ...state,
    progress: [...state.progress],
    changes: state.changes + (action.type === "time" ? 0 : 1),
  };
  next.progress[state.current] = p;
  const goNext = () => {
    const later = questions.findIndex(
      (_, i) =>
        i > state.current &&
        (mode === "regular" || !state.progress[i].submitted),
    );
    if (later < 0) next.review = true;
    else next.current = later;
  };
  if (action.type === "time") {
    const ms = Math.max(0, Math.min(action.ms, 15_000));
    if (!Number.isFinite(ms) || state.review || p.step === "done") return state;
    next.elapsedMs += ms;
    p.elapsedMs += ms;
    p.stepMs = { ...p.stepMs, [p.step]: (p.stepMs[p.step] ?? 0) + ms };
    if (p.step === "preview") p.previewMs = Math.min(5000, p.previewMs + ms);
    if (p.step === "passage") {
      p.segmentMs = [...p.segmentMs];
      p.segmentMs[p.segment] = (p.segmentMs[p.segment] ?? 0) + ms;
    }
    if (p.step === "choice") {
      const id = p.order[p.choiceIndex];
      if (id) {
        const times = [...(p.wordMs[id] ?? [])];
        times[p.word] = (times[p.word] ?? 0) + ms;
        p.wordMs = { ...p.wordMs, [id]: times };
      }
    }
    return next;
  }
  if (action.type === "goto") {
    if (!canNavigate(state, mode) || !questions[action.index]) return state;
    next.current = action.index;
    next.review = false;
    return next;
  }
  if (action.type === "review") {
    if (!canNavigate(state, mode)) return state;
    next.review = true;
    return next;
  }
  if (action.type === "mark") {
    p.marked = !p.marked;
    return next;
  }
  if (action.type === "highlights") {
    p.highlights = action.highlights;
    return next;
  }
  if (action.type === "crossout") {
    next.crossOut = !state.crossOut;
    if (p.step === "crossout" && next.crossOut) p.step = "choice";
    return next;
  }
  if (mode === "guided" && (p.submitted || state.review)) return state;
  if (action.type === "eliminate" && mode === "regular") {
    p.eliminated = p.eliminated.includes(action.choice)
      ? p.eliminated.filter((id) => id !== action.choice)
      : [...p.eliminated, action.choice];
    if (p.answer === action.choice) {
      p.answer = null;
      p.submitted = false;
    }
    return next;
  }
  if (action.type === "skip" && p.step === "preview") {
    p.skipped = true;
    goNext();
    return next;
  }
  if (action.type === "solve" && p.step === "preview") {
    p.step = "round";
    return next;
  }
  if (action.type === "round" && p.step === "round") {
    p.round = action.round;
    p.step = "question";
    return next;
  }
  if (action.type === "prediction" && p.step === "prediction") {
    p.prediction = action.text.slice(0, 4000);
    return next;
  }
  if (action.type === "flag" && p.step === "flags" && !p.flagsChecked) {
    p.flags = { ...p.flags, [action.choice]: action.flag };
    return next;
  }
  if (action.type === "order" && p.step === "order") {
    p.order = [...new Set(action.order.filter((id) => CHOICES.includes(id)))];
    return next;
  }
  if (action.type === "answer" && p.step === "select") {
    p.answer = action.choice;
    p.eliminated = p.eliminated.filter((id) => id !== action.choice);
    if (mode === "regular") {
      p.submitted = true;
      next.attemptOrder = [...new Set([...state.attemptOrder, question.id])];
    }
    return next;
  }
  if (action.type === "uncertain" && p.step === "confidence") {
    const remaining = question.choices
      .map((choice) => choice.id)
      .filter((id) => !p.order.includes(id));
    if (remaining.length) {
      p.choiceIndex = p.order.length;
      p.order = [...p.order, ...remaining];
      p.word = 0;
      p.deferred = true;
      p.step = "choice";
    } else {
      p.step = "topic";
      p.segment = 0;
      p.order = [];
      p.choiceIndex = 0;
      p.word = 0;
      p.deferred = false;
      p.eliminated = [];
      p.flagsChecked = false;
    }
    return next;
  }
  if (action.type === "decide" && p.step === "choice") {
    const id = p.order[p.choiceIndex];
    const choice = question.choices.find((choice) => choice.id === id);
    if (!choice || p.word < wordCount(choice.text) - 1) return state;
    p.eliminated = action.keep
      ? p.eliminated.filter((value) => value !== id)
      : [...new Set([...p.eliminated, id])];
    if (p.choiceIndex + 1 < p.order.length) {
      p.choiceIndex++;
      p.word = 0;
    } else p.step = "confidence";
    return next;
  }
  if (action.type !== "next") return state;
  switch (p.step) {
    case "question":
      p.step = "topic";
      break;
    case "topic":
      p.step = "passage";
      break;
    case "passage":
      if (p.segment < segmentCount(question) - 1) p.segment++;
      else p.step = question.topic === "graphs" ? "figure" : "prediction";
      break;
    case "figure":
      p.step = "prediction";
      break;
    case "prediction":
      if (!p.prediction.trim()) return state;
      p.step = p.round === 1 ? "order" : "flags";
      break;
    case "flags":
      if (!p.flagsChecked) p.flagsChecked = true;
      else p.step = "order";
      break;
    case "order": {
      const required = suggestedOrder(question, p.round !== 1);
      if (
        p.order.length !== required.length ||
        required.some((id) => !p.order.includes(id))
      )
        return state;
      p.step = state.crossOut ? "choice" : "crossout";
      break;
    }
    case "choice": {
      const choice = question.choices.find(
        (choice) => choice.id === p.order[p.choiceIndex],
      );
      if (choice) p.word = Math.min(p.word + 1, wordCount(choice.text) - 1);
      break;
    }
    case "confidence":
      p.step = "select";
      break;
    case "select":
      if (mode === "guided") {
        if (!p.answer) return state;
        p.submitted = true;
        p.step = "done";
        next.attemptOrder = [...new Set([...state.attemptOrder, question.id])];
      }
      goNext();
      break;
    default:
      return state;
  }
  return next;
}
