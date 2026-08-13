// Test-flow state machine: intro -> module -> review -> (route) -> module 2
// -> review -> break -> math ... -> results. Pure logic; driven by TestRunner.

import type {
  AnswerMap,
  AnswerValue,
  ChoiceId,
  ModuleVariant,
  PracticeTest,
  Question,
  Section,
  SectionId,
  TestModule,
} from "./types";
import { routeVariant } from "./scoring";
import { normalizeGridInInput } from "./gridIn";

export type Phase =
  | "intro"
  | "module"
  | "review"
  | "moduleOver"
  | "break"
  | "results";

export type BreakTarget = "module2" | "nextSection";

export type TestState = {
  phase: Phase;
  sectionIndex: number;
  moduleOrder: 1 | 2;
  routed: Partial<Record<SectionId, ModuleVariant>>;
  qIndex: number;
  answers: AnswerMap;
  marked: Record<string, boolean>;
  eliminated: Record<string, ChoiceId[]>;
  eliminatorOn: boolean;
  timeLeft: number;
  timerHidden: boolean;
  perQuestionTime: Record<string, number>;
  extendedTime: boolean;
  breakTarget?: BreakTarget;
  // Set only when the student reaches results by finishing the test (not via the
  // dev jump), so the runner saves + awards exactly one genuine attempt.
  completedViaFlow?: boolean;
};

export type TestAction =
  | { type: "START"; extendedTime?: boolean }
  | { type: "TICK" }
  | { type: "SELECT"; questionId: string; value: AnswerValue }
  | { type: "TOGGLE_MARK"; questionId: string }
  | { type: "TOGGLE_ELIMINATE"; questionId: string; choice: ChoiceId }
  | { type: "SET_ELIMINATOR"; on: boolean }
  | { type: "GOTO"; index: number }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "OPEN_REVIEW" }
  | { type: "SUBMIT_MODULE" }
  | { type: "ADVANCE" }
  | { type: "END_BREAK" }
  | { type: "TOGGLE_TIMER" }
  | { type: "RESTART" }
  | { type: "RESUME"; state: TestState }
  | { type: "DEV_JUMP"; sectionIndex: number; moduleOrder: 1 | 2; variant?: ModuleVariant }
  | { type: "DEV_RESULTS" };

export function initialState(): TestState {
  return {
    phase: "intro",
    sectionIndex: 0,
    moduleOrder: 1,
    routed: {},
    qIndex: 0,
    answers: {},
    marked: {},
    eliminated: {},
    eliminatorOn: false,
    timeLeft: 0,
    timerHidden: false,
    perQuestionTime: {},
    extendedTime: false,
  };
}

export function activeSection(test: PracticeTest, s: TestState): Section {
  return test.sections[s.sectionIndex];
}

export function activeModule(test: PracticeTest, s: TestState): TestModule {
  const section = activeSection(test, s);
  if (s.moduleOrder === 1) return section.module1;
  return section.module2[s.routed[section.id] ?? "easy"];
}

export function currentQuestion(test: PracticeTest, s: TestState): Question | undefined {
  return activeModule(test, s).questions[s.qIndex];
}

export function makeReducer(test: PracticeTest) {
  const gridQuestionIds = new Set(
    test.sections.flatMap((section) =>
      [section.module1, ...Object.values(section.module2)]
        .flatMap((testModule) => testModule.questions)
        .filter((question) => question.type === "grid")
        .map((question) => question.id),
    ),
  );

  function startSection(state: TestState, sectionIndex: number): TestState {
    const section = test.sections[sectionIndex];
    return {
      ...state,
      sectionIndex,
      moduleOrder: 1,
      qIndex: 0,
      eliminatorOn: false,
      timeLeft: Math.round(section.minutesPerModule * 60 * (state.extendedTime ? 1.5 : 1)),
      breakTarget: undefined,
      phase: "module",
    };
  }

  function submitModule(state: TestState): TestState {
    const section = test.sections[state.sectionIndex];
    if (state.moduleOrder === 1) {
      const variant = routeVariant(test, section, state.answers);
      if (state.extendedTime) {
        return {
          ...state,
          routed: { ...state.routed, [section.id]: variant },
          moduleOrder: 2,
          qIndex: 0,
          eliminatorOn: false,
          timeLeft: 5 * 60,
          phase: "break",
          breakTarget: "module2",
        };
      }
      return {
        ...state,
        routed: { ...state.routed, [section.id]: variant },
        moduleOrder: 2,
        qIndex: 0,
        eliminatorOn: false,
        timeLeft: section.minutesPerModule * 60,
        breakTarget: undefined,
        phase: "module",
      };
    }
    if (state.sectionIndex < test.sections.length - 1) {
      return {
        ...state,
        phase: "break",
        timeLeft: test.breakMinutes * 60,
        breakTarget: "nextSection",
      };
    }
    return { ...state, phase: "results", completedViaFlow: true };
  }

  function endBreak(state: TestState): TestState {
    if (state.breakTarget === "module2") {
      const section = test.sections[state.sectionIndex];
      return {
        ...state,
        phase: "module",
        qIndex: 0,
        timeLeft: Math.round(section.minutesPerModule * 60 * 1.5),
        breakTarget: undefined,
      };
    }
    return startSection(state, state.sectionIndex + 1);
  }

  return function reducer(state: TestState, action: TestAction): TestState {
    switch (action.type) {
      case "START":
        return startSection({ ...initialState(), extendedTime: Boolean(action.extendedTime) }, 0);
      case "TICK": {
        if (state.phase === "module") {
          if (state.timeLeft <= 1) return { ...state, timeLeft: 0, phase: "moduleOver" };
          const q = currentQuestion(test, state);
          const perQuestionTime = q
            ? { ...state.perQuestionTime, [q.id]: (state.perQuestionTime[q.id] ?? 0) + 1 }
            : state.perQuestionTime;
          return { ...state, timeLeft: state.timeLeft - 1, perQuestionTime };
        }
        if (state.phase === "review") {
          if (state.timeLeft <= 1) return { ...state, timeLeft: 0, phase: "moduleOver" };
          return { ...state, timeLeft: state.timeLeft - 1 };
        }
        if (state.phase === "break") {
          if (state.timeLeft <= 1) return endBreak(state);
          return { ...state, timeLeft: state.timeLeft - 1 };
        }
        return state;
      }
      case "SELECT": {
        const value = gridQuestionIds.has(action.questionId)
          ? normalizeGridInInput(String(action.value))
          : action.value;
        return { ...state, answers: { ...state.answers, [action.questionId]: value } };
      }
      case "TOGGLE_MARK":
        return {
          ...state,
          marked: { ...state.marked, [action.questionId]: !state.marked[action.questionId] },
        };
      case "TOGGLE_ELIMINATE": {
        const cur = state.eliminated[action.questionId] ?? [];
        const next = cur.includes(action.choice)
          ? cur.filter((c) => c !== action.choice)
          : [...cur, action.choice];
        return { ...state, eliminated: { ...state.eliminated, [action.questionId]: next } };
      }
      case "SET_ELIMINATOR":
        return { ...state, eliminatorOn: action.on };
      case "GOTO":
        return { ...state, qIndex: action.index, phase: "module" };
      case "NEXT": {
        const mod = activeModule(test, state);
        if (state.qIndex < mod.questions.length - 1) return { ...state, qIndex: state.qIndex + 1 };
        return { ...state, phase: "review" };
      }
      case "BACK":
        return { ...state, qIndex: Math.max(0, state.qIndex - 1) };
      case "OPEN_REVIEW":
        return { ...state, phase: "review" };
      case "SUBMIT_MODULE":
        return { ...state, phase: "moduleOver" };
      case "ADVANCE":
        return submitModule(state);
      case "END_BREAK":
        return endBreak(state);
      case "TOGGLE_TIMER":
        return { ...state, timerHidden: !state.timerHidden };
      case "RESTART":
        return initialState();
      case "RESUME":
        return action.state;
      case "DEV_JUMP": {
        const section = test.sections[action.sectionIndex];
        const routed =
          action.moduleOrder === 2 && action.variant
            ? { ...state.routed, [section.id]: action.variant }
            : state.routed;
        return {
          ...state,
          phase: "module",
          sectionIndex: action.sectionIndex,
          moduleOrder: action.moduleOrder,
          routed,
          qIndex: 0,
          eliminatorOn: false,
          timeLeft: Math.round(section.minutesPerModule * 60 * (state.extendedTime ? 1.5 : 1)),
          breakTarget: undefined,
        };
      }
      case "DEV_RESULTS":
        return { ...state, phase: "results" };
      default:
        return state;
    }
  };
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
