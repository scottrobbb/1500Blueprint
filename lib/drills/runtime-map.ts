// Pure mappers: DB DrillQuestion[] -> each player's runtime prop shape. These
// keep the server page thin and the players DB-agnostic. Each mapper guards
// against malformed/draft content by skipping items missing required pieces, so
// a single bad row never crashes a whole drill.

import type { Domain } from "@/lib/sat/types";
import type {
  DrillQuestion,
  FlashcardContent,
  GrammarContent,
  GrammarQuestion,
  LetteredChoice,
  ReadingContent,
  TargetedMathContent,
  VocabContent,
} from "./types";
import type { ReadingItem } from "@/components/drills/reading/ReadingDrill";
import type { MathQuestion } from "@/components/drills/math/mockData";
import type { VocabItem } from "@/components/drills/vocab/mock";
import type { Flashcard } from "@/components/drills/flashcards/mock";

// Grammar domain is fixed for this drill; DrillQuestion.domain is loosely typed
// (string|null), so default to the conventions domain when it isn't a real one.
const GRAMMAR_DOMAIN: Domain = "Standard English Conventions";

// DrillQuestion[] -> GrammarQuestion[] (MultipleChoiceQuestion & { pattern }).
// Skips items without choices or a correct answer.
export function toGrammarQuestions(qs: DrillQuestion[]): GrammarQuestion[] {
  const out: GrammarQuestion[] = [];
  for (const q of qs) {
    const c = q.content as GrammarContent;
    if (!Array.isArray(c.choices) || c.choices.length === 0 || !c.correct) continue;
    out.push({
      id: q.id,
      type: "mc",
      domain: (q.domain as Domain | null) ?? GRAMMAR_DOMAIN,
      difficulty: q.difficulty,
      passage: q.passage ?? undefined,
      figureUrl: q.figureUrl ?? undefined,
      prompt: q.stem ?? "",
      explanation: q.explanation ?? "",
      choices: c.choices as LetteredChoice[],
      correct: c.correct,
      pattern: c.pattern ?? "",
    });
  }
  return out;
}

// DrillQuestion[] -> targeted-math runtime ({ id, prompt, accepted }). The problem
// text lives in the stem (matching the admin editor + preview); fall back to the
// passage only if the stem is empty. Skips items with no accepted answers.
export function toMathQuestions(qs: DrillQuestion[]): MathQuestion[] {
  const out: MathQuestion[] = [];
  for (const q of qs) {
    if (q.answerType !== "grid_in") continue;
    const c = q.content as Extract<TargetedMathContent, { kind: "grid" }>;
    if (!Array.isArray(c.accepted) || c.accepted.length === 0) continue;
    out.push({
      id: q.id,
      prompt: (q.stem?.trim() || q.passage?.trim()) ?? "",
      accepted: c.accepted,
    });
  }
  return out;
}

// DrillQuestion[] -> VocabItem[]. correct = options[correctIndex]. Skips items
// whose correctIndex falls outside the options array.
export function toVocabItems(qs: DrillQuestion[]): VocabItem[] {
  const out: VocabItem[] = [];
  for (const q of qs) {
    const c = q.content as VocabContent;
    if (!Array.isArray(c.options) || c.options.length === 0) continue;
    const correct = c.options[c.correctIndex];
    if (correct === undefined) continue;
    out.push({
      id: q.id,
      pos: c.pos ?? "",
      definition: c.definition ?? "",
      example: c.example ?? "",
      options: c.options,
      correct,
    });
  }
  return out;
}

// DrillQuestion[] -> Flashcard[] (from content). Skips items missing a word.
export function toFlashcards(qs: DrillQuestion[]): Flashcard[] {
  const out: Flashcard[] = [];
  for (const q of qs) {
    const c = q.content as FlashcardContent;
    if (!c.word) continue;
    out.push({
      word: c.word,
      pos: c.pos ?? "",
      definition: c.definition ?? "",
      example: c.example ?? "",
    });
  }
  return out;
}

// DrillQuestion[] -> ReadingItem[]. Skips items with an empty passage body.
export function toReadingItems(qs: DrillQuestion[]): ReadingItem[] {
  const out: ReadingItem[] = [];
  for (const q of qs) {
    const c = q.content as ReadingContent;
    if (!Array.isArray(c.body) || c.body.length === 0) continue;
    out.push({
      id: q.id,
      body: c.body,
      // Guard against a 0/missing read time (which would skip the timed read).
      readSeconds: c.readSeconds && c.readSeconds > 0 ? c.readSeconds : 90,
      keyPoints: Array.isArray(c.keyPoints) ? c.keyPoints : [],
    });
  }
  return out;
}
