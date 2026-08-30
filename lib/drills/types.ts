// Data model for the drills suite (Phase 2). See the vault notes
// "1500 — Drill Suite (Reference Teardown)" and "1500 — AI Drilling Agent".
// The UI is built against these shapes with mock data; the logic phase fills
// the same shapes, so wiring the backend later does not touch the components.

import type { Difficulty, MultipleChoiceQuestion } from "@/lib/sat/types";

export type DrillSlug =
  | "grammar"
  | "targeted-math"
  | "reading"
  | "word-scan"
  | "vocab"
  | "flashcards"
  | "ai-math";

export type AiRole =
  | "none"
  | "grade-process" // grade an explained solving process (Grammar)
  | "grade-summary" // grade a from-memory recall summary (Reading)
  | "generate"; // generate question / passage content (Reading, AI Math)

// Per-drill brand accent. Maps to the brand color tokens in globals.css.
export type Accent = "brand" | "navy" | "gold" | "sky";

// Free-text grading result shared by the AI drills (Grammar "Explain Your
// Process" and Reading "Your Summary"). Scott owns the prompt that produces it.
export type ProcessFeedback = {
  score: number; // 0..100
  verdict: string; // one-line summary shown under the score
  feedback: string; // AI Feedback prose
  stepsMissed: string[]; // "Steps You Missed" checklist (empty on a perfect run)
};

// Per-pattern mastery, the Grammar Drill progression model.
export type MasteryState = {
  mastered: number; // patterns mastered so far
  total: number; // total patterns in the set
  streak: number; // current perfect-score streak toward the target
  streakTarget: number; // perfect scores in a row to master a pattern (2)
  cycle: number;
};

// Grammar questions are SAT Standard-English-conventions MC items, tagged with
// the grammar pattern they teach.
export type GrammarQuestion = MultipleChoiceQuestion & { pattern: string };

// ---------------------------------------------------------------------------
// Drill CMS (admin editor + DB-backed content). These shapes mirror the
// Supabase tables in supabase/drills.sql, camelCased. The editor and the
// runtime players both read/write them, so content stays component-agnostic.
// ---------------------------------------------------------------------------

export type SatSection = "rw" | "math";

// Answer types across all 7 drills. The DB stores these exact string values.
export type AnswerType =
  | "mc_single" // single-select multiple choice (grammar, vocab, ai-math mc)
  | "grid_in" // student-produced response / grid-in (targeted-math, ai-math grid)
  | "multi_select" // flag a set of choices (word-scan)
  | "free_text" // open recall summary (reading)
  | "spaced_repetition"; // flashcard review (flashcards)

export type QuestionStatus = "draft" | "published";

export type WalkthroughKind = "normal" | "confirm_option";

export type WalkthroughStep = {
  id: string;
  position: number; // 1-based
  kind: WalkthroughKind;
  text: string;
  detail?: string;
};

// A single lettered answer choice. Shared by grammar / word-scan / ai-math mc.
export type LetteredChoice = { id: "A" | "B" | "C" | "D"; text: string };

// Drill-specific payload stored in drill_questions.content (jsonb). One variant
// per drill; the field editor + player both narrow on drillSlug. Unknown keys
// are tolerated so older content keeps loading.
export type GrammarContent = {
  pattern?: string;
  choices: LetteredChoice[];
  correct: "A" | "B" | "C" | "D";
};
export type ReadingContent = {
  body: string[];
  readSeconds: number;
  keyPoints: string[];
  level?: number;
};
export type TargetedMathContent =
  | { kind: "mc"; choices: LetteredChoice[]; correct: LetteredChoice["id"] }
  | { kind: "grid"; accepted: string[] };
export type AiMathContent =
  | { kind: "mc"; choices: LetteredChoice[]; correct: "A" | "B" | "C" | "D" }
  | { kind: "grid"; accepted: string[] };
export type VocabContent = {
  pos: string;
  definition: string;
  example?: string;
  options: string[];
  correctIndex: number; // index (0-3) of the correct option; stable across text edits/duplicates
};
export type WordScanContent = {
  mode: string;
  verbs: string[];
  choices: LetteredChoice[];
  correct: ("A" | "B" | "C" | "D")[];
};
export type FlashcardContent = {
  word: string;
  pos: string;
  definition: string;
  example: string;
};

export type DrillContent =
  | GrammarContent
  | ReadingContent
  | TargetedMathContent
  | AiMathContent
  | VocabContent
  | WordScanContent
  | FlashcardContent
  | Record<string, unknown>;

// One authored item (matches a drill_questions row, camelCased).
export type DrillQuestion = {
  id: string;
  drillSlug: DrillSlug;
  section: SatSection | null;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty;
  answerType: AnswerType;
  stem: string | null;
  passage: string | null;
  figureUrl: string | null;
  content: DrillContent;
  explanation: string | null;
  status: QuestionStatus;
  includeInQuestionBank: boolean;
  questionBankFreeTier: boolean;
  visibleInDrill: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  walkthrough?: WalkthroughStep[]; // hydrated for grade-process drills
};

// Per-drill-TYPE config (matches a drills row, camelCased). The editable
// grading prompt + scoring config live here.
export type DrillCategory = "Writing" | "Reading" | "Math" | "Vocabulary";

export type DrillConfig = {
  slug: DrillSlug;
  title: string;
  category: DrillCategory;
  accent: Accent;
  usesAi: boolean;
  aiRole: AiRole;
  answerTypes: AnswerType[];
  gradingPrompt: string | null;
  scoringConfig: Record<string, unknown>;
  status: QuestionStatus;
};

// Canonical taxonomy row (matches sat_skills).
export type SatSkill = {
  id: string;
  section: SatSection;
  domain: string;
  name: string;
  sort: number;
};

// Props every per-drill field editor receives (the editor registry contract).
export type FieldEditorProps = {
  question: DrillQuestion;
  onChange: (patch: Partial<DrillQuestion>) => void;
};
