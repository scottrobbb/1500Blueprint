// Data model for the Bluebook-style digital SAT emulator.
// See vault: "1500 — Practice Test Platform (Bluebook Emulator)".

export type SectionId = "rw" | "math";
export type ModuleVariant = "easy" | "hard";
export type ChoiceId = "A" | "B" | "C" | "D";
// "challenge" is a real stored tier, not a display-only bucket: it is written
// to drill_questions.difficulty and gates access through the challengeQuestions
// entitlement. Practice-test questions never carry it -- see the DIFFICULTIES
// list in TestQuestionEditor, which stays three-valued.
export type Difficulty = "easy" | "medium" | "hard" | "challenge";

// The single source of truth for the tier list. Every guard that needs to ask
// "is this a difficulty?" must use this rather than inlining the values:
// a stale local copy that omits "challenge" silently filters real questions
// out of the bank instead of failing loudly.
export const DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const satisfies readonly Difficulty[];

export function isDifficulty(value: string | null | undefined): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
}

export type Domain =
  // Reading & Writing
  | "Information and Ideas"
  | "Craft and Structure"
  | "Expression of Ideas"
  | "Standard English Conventions"
  // Math
  | "Algebra"
  | "Advanced Math"
  | "Problem-Solving and Data Analysis"
  | "Geometry and Trigonometry";

export type Choice = { id: ChoiceId; text: string };

type BaseQuestion = {
  id: string;
  domain: Domain;
  /** More granular SAT skill/topic, when supplied by the source form. */
  skill?: string;
  difficulty: Difficulty;
  /** R&W passage / stimulus (left pane), or a Math context line. Optional. */
  passage?: string;
  /** Public URL (Supabase Storage) of a figure/chart shown with the question. */
  figureUrl?: string;
  /** The question stem. */
  prompt: string;
  /** Why the correct answer is correct (shown on the results review). */
  explanation: string;
};

export type MultipleChoiceQuestion = BaseQuestion & {
  type: "mc";
  choices: Choice[];
  correct: ChoiceId;
  /** Optional per-choice rationale (why each distractor is wrong). */
  choiceExplanations?: Partial<Record<ChoiceId, string>>;
};

export type GridInQuestion = BaseQuestion & {
  type: "grid";
  /** Accepted answers as raw strings, e.g. ["1.5", "3/2"]. */
  acceptedAnswers: string[];
};

export type Question = MultipleChoiceQuestion | GridInQuestion;

export type TestModule = {
  id: string;
  order: 1 | 2;
  /** Set only on module 2 variants. */
  variant?: ModuleVariant;
  questions: Question[];
};

export type Section = {
  id: SectionId;
  name: string; // "Reading and Writing" | "Math"
  shortName: string; // "Reading and Writing" | "Math"
  minutesPerModule: number; // 32 (R&W) | 35 (Math)
  module1: TestModule;
  module2: Record<ModuleVariant, TestModule>;
};

export type PracticeTest = {
  id: string;
  title: string;
  sections: Section[]; // ordered: [rw, math]
  /** Fraction correct on module 1 needed to route into the HARD module 2. */
  routeThreshold: Record<SectionId, number>;
  /** Minutes for the between-section break. */
  breakMinutes: number;
};

export type AnswerValue = ChoiceId | string;
export type AnswerMap = Record<string, AnswerValue | undefined>;
