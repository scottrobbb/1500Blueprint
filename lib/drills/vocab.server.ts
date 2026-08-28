import "server-only";

import type { Flashcard } from "@/components/drills/flashcards/mock";
import { awardDrill, type AwardOutcome } from "@/lib/gamification/state";
import {
  recordObjectiveProgress,
  summarizeDrillQuestionSession,
} from "@/lib/drills/progress";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { VocabContent } from "./types";
import { reportServerError } from "@/lib/observability/server";
import type { VocabImportEntry } from "./vocabImport";
import {
  nextVocabFlashcardPosition,
  summarizeVocabAttempts,
  VOCAB_SESSION_SIZE,
  type VocabAnswerResult,
  type VocabDashboardState,
} from "./vocabProgress";

const VOCAB_SET_TITLE = "Vocab Drill Saves";

type VocabQuestionRow = { id: string; content: Record<string, unknown> | null };
type VocabSetRow = { id: string; description: string | null };
type VocabCardRow = { id: string; position: number; term: string; definition: string };
type StoredVocabState = { currentStreak: number; bestStreak: number; autoAdd: boolean };

export type VocabFlashcard = Flashcard & { prioritized: boolean };
export type VocabFlashcardImportOutcome = { imported: number; inserted: number; updated: number };

const DEFAULT_STATE: StoredVocabState = { currentStreak: 0, bestStreak: 0, autoAdd: true };

function databaseError(action: string, error: { message: string; code?: string }): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}

function vocabContent(row: VocabQuestionRow): VocabContent {
  return (row.content ?? {}) as VocabContent;
}

function correctWord(row: VocabQuestionRow): string | null {
  const content = vocabContent(row);
  if (!Array.isArray(content.options)) return null;
  return content.options[content.correctIndex] ?? null;
}

function stateDescription(state: StoredVocabState): string {
  return `Saved automatically from the Vocab Drill. Current streak: ${state.currentStreak}. Best streak: ${state.bestStreak}. Auto-add: ${state.autoAdd ? "on" : "off"}.`;
}

function parseState(description: string | null): StoredVocabState {
  const match = description?.match(
    /Current streak: (\d+)\. Best streak: (\d+)\. Auto-add: (on|off)\./i,
  );
  return match
    ? {
        currentStreak: Number(match[1]),
        bestStreak: Number(match[2]),
        autoAdd: match[3].toLowerCase() === "on",
      }
    : DEFAULT_STATE;
}

function encodeDefinition(content: { definition: string; pos?: string; example?: string }): string {
  const lines = [`Definition: ${content.definition ?? ""}`];
  if (content.pos) lines.unshift(`Part of speech: ${content.pos}`);
  if (content.example) lines.push(`Example: ${content.example}`);
  return lines.join("\n");
}

function decodeDefinition(value: string): Omit<Flashcard, "word"> {
  const pos = value.match(/^Part of speech:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const definition = value.match(/^Definition:\s*(.+)$/m)?.[1]?.trim() ?? value;
  const example = value.match(/^Example:\s*(.+)$/m)?.[1]?.trim() ?? "";
  return { pos, definition, example };
}

async function loadQuestion(questionId: string): Promise<VocabQuestionRow> {
  const { data, error } = await supabaseAdmin()
    .from("drill_questions")
    .select("id,content")
    .eq("id", questionId)
    .eq("drill_slug", "vocab")
    .eq("status", "published")
    .maybeSingle<VocabQuestionRow>();
  if (error) throw databaseError("Could not load vocab question", error);
  if (!data || !correctWord(data)) throw new Error("Vocab question was not found.");
  return data;
}

async function loadVocabSet(email: string): Promise<VocabSetRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("flashcard_sets")
    .select("id,description")
    .eq("owner_email", email)
    .eq("title", VOCAB_SET_TITLE)
    .eq("visibility", "private")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<VocabSetRow>();
  if (error) throw databaseError("Could not load the Vocab Flashcards deck", error);
  return data ?? null;
}

async function ensureVocabSet(email: string): Promise<VocabSetRow> {
  const existing = await loadVocabSet(email);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin()
    .from("flashcard_sets")
    .insert({
      owner_email: email,
      title: VOCAB_SET_TITLE,
      description: stateDescription(DEFAULT_STATE),
      visibility: "private",
    })
    .select("id,description")
    .single<VocabSetRow>();
  if (error || !data) throw databaseError("Could not create the Vocab Flashcards deck", error ?? { message: "No row returned" });
  return data;
}

async function saveStoredState(email: string, state: StoredVocabState): Promise<VocabSetRow> {
  const set = await ensureVocabSet(email);
  const description = stateDescription(state);
  const { error } = await supabaseAdmin()
    .from("flashcard_sets")
    .update({ description })
    .eq("id", set.id)
    .eq("owner_email", email);
  if (error) throw databaseError("Could not save vocab settings", error);
  return { ...set, description };
}

async function loadCards(setId: string): Promise<VocabCardRow[]> {
  const rows: VocabCardRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin()
      .from("flashcard_cards")
      .select("id,position,term,definition")
      .eq("set_id", setId)
      .order("position")
      .range(from, from + pageSize - 1)
      .returns<VocabCardRow[]>();
    if (error) throw databaseError("Could not load Vocab Flashcards", error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function loadCardPositions(setId: string): Promise<number[]> {
  const positions: number[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin()
      .from("flashcard_cards")
      .select("position")
      .eq("set_id", setId)
      .order("position")
      .range(from, from + pageSize - 1)
      .returns<{ position: number }[]>();
    if (error) throw databaseError("Could not order Vocab Flashcards", error);
    positions.push(...(data ?? []).map((row) => row.position));
    if ((data?.length ?? 0) < pageSize) return positions;
  }
}

async function saveQuestionAsFlashcard(
  email: string,
  question: VocabQuestionRow,
  prioritized: boolean,
): Promise<void> {
  const set = await ensureVocabSet(email);
  const content = vocabContent(question);
  const word = correctWord(question);
  if (!word) throw new Error("Vocab question has no correct word.");
  const db = supabaseAdmin();
  const { data: existing, error: existingError } = await db
    .from("flashcard_cards")
    .select("id,position")
    .eq("set_id", set.id)
    .ilike("term", word)
    .limit(1)
    .maybeSingle<{ id: string; position: number }>();
  if (existingError) throw databaseError("Could not inspect Vocab Flashcards", existingError);
  if (existing) {
    const position =
      prioritized && existing.position >= 0
        ? nextVocabFlashcardPosition(await loadCardPositions(set.id), true)
        : existing.position;
    const { error } = await db
      .from("flashcard_cards")
      .update({ term: word, definition: encodeDefinition(content), position })
      .eq("id", existing.id)
      .eq("set_id", set.id);
    if (error) throw databaseError("Could not update the vocab flashcard", error);
    return;
  }

  const position = nextVocabFlashcardPosition(
    await loadCardPositions(set.id),
    prioritized,
  );
  const { error } = await db.from("flashcard_cards").insert({
    set_id: set.id,
    position,
    term: word,
    definition: encodeDefinition(content),
  });
  if (error) throw databaseError("Could not save the vocab flashcard", error);
}

async function loadAllVocabQuestionRows(): Promise<VocabQuestionRow[]> {
  const rows: VocabQuestionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin()
      .from("drill_questions")
      .select("id,content")
      .eq("drill_slug", "vocab")
      .eq("status", "published")
      .order("created_at")
      .range(from, from + pageSize - 1)
      .returns<VocabQuestionRow[]>();
    if (error) throw databaseError("Could not load vocab words", error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function loadVocabStreak(
  email: string,
  fallback: StoredVocabState,
): Promise<Pick<StoredVocabState, "currentStreak" | "bestStreak">> {
  const rows: { id: string; correct: boolean; attempted_at: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabaseAdmin()
      .from("drill_question_attempts")
      .select("id,correct,attempted_at")
      .eq("email", email)
      .eq("drill_slug", "vocab")
      .eq("source", "drill")
      .order("attempted_at")
      .order("id")
      .range(from, from + pageSize - 1)
      .returns<{ id: string; correct: boolean; attempted_at: string }[]>();
    if (result.error) throw databaseError("Could not load vocab answer history", result.error);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) break;
  }
  if (rows.length === 0) {
    return { currentStreak: fallback.currentStreak, bestStreak: fallback.bestStreak };
  }
  let currentStreak = 0;
  let bestStreak = fallback.bestStreak;
  for (const row of rows) {
    currentStreak = row.correct ? currentStreak + 1 : 0;
    bestStreak = Math.max(bestStreak, currentStreak);
  }
  return { currentStreak, bestStreak };
}

export async function loadVocabDashboard(email: string): Promise<VocabDashboardState> {
  const db = supabaseAdmin();
  const [questions, progressRes, attemptsRes, set] = await Promise.all([
    loadAllVocabQuestionRows(),
    db
      .from("drill_question_progress")
      .select("question_id,attempts,best_score,mastered_at")
      .eq("email", email)
      .eq("drill_slug", "vocab")
      .order("last_seen_at", { ascending: false })
      .returns<{
        question_id: string;
        attempts: number;
        best_score: number | null;
        mastered_at: string | null;
      }[]>(),
    db
      .from("module_attempts")
      .select("correct,total,per_question_time,created_at")
      .eq("email", email)
      .eq("test_slug", "vocab")
      .eq("module_key", "vocab-drill")
      .order("created_at", { ascending: true })
      .returns<{
        correct: number;
        total: number;
        per_question_time: { durationSeconds?: number } | null;
        created_at: string;
      }[]>(),
    loadVocabSet(email),
  ]);
  if (progressRes.error) throw databaseError("Could not load vocab progress", progressRes.error);
  if (attemptsRes.error) throw databaseError("Could not load vocab attempts", attemptsRes.error);

  const cards = set ? await loadCards(set.id) : [];
  const state = parseState(set?.description ?? null);
  const streak = await loadVocabStreak(email, state);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const questionIdByWord = new Map(
    questions.flatMap((question) => {
      const word = correctWord(question);
      return word ? [[word.toLocaleLowerCase(), question.id] as const] : [];
    }),
  );
  const progress = progressRes.data ?? [];

  return {
    totalWords: questions.length,
    masteredCount: progress.filter((row) => row.mastered_at).length,
    currentStreak: streak.currentStreak,
    bestStreak: streak.bestStreak,
    autoAddFlashcards: state.autoAdd,
    savedQuestionIds: cards.flatMap((card) => {
      const id = questionIdByWord.get(card.term.toLocaleLowerCase());
      return id ? [id] : [];
    }),
    bookmarkedQuestionIds: cards.flatMap((card) => {
      if (card.position >= 0) return [];
      const id = questionIdByWord.get(card.term.toLocaleLowerCase());
      return id ? [id] : [];
    }),
    flashcardCount: cards.length,
    words: progress.flatMap((row) => {
      const question = questionById.get(row.question_id);
      const word = question ? correctWord(question) : null;
      return word
        ? [{
            questionId: row.question_id,
            word,
            correctStreak: row.best_score ?? 0,
            mastered: Boolean(row.mastered_at),
          }]
        : [];
    }),
    attempts: summarizeVocabAttempts(
      (attemptsRes.data ?? []).map((row) => ({
        correct: row.correct,
        total: row.total,
        durationSeconds: row.per_question_time?.durationSeconds ?? 0,
      })),
    ),
  };
}

export async function recordVocabAnswer(
  email: string,
  input: {
    questionId: string;
    selectedWord: string;
    clientToken: string;
    sessionToken: string;
  },
): Promise<VocabAnswerResult> {
  const question = await loadQuestion(input.questionId);
  const content = vocabContent(question);
  const answer = correctWord(question) as string;
  if (!content.options.includes(input.selectedWord)) throw new Error("Selected word is not an answer choice.");
  const isCorrect = input.selectedWord === answer;
  await recordObjectiveProgress(email, {
    drillSlug: "vocab",
    questionId: input.questionId,
    correct: isCorrect,
    clientToken: input.clientToken,
    sessionToken: input.sessionToken,
  });

  const set = await loadVocabSet(email);
  const stored = parseState(set?.description ?? null);

  let autoAdded = false;
  let flashcardSaveFailed = false;
  if (!isCorrect && stored.autoAdd) {
    try {
      await saveQuestionAsFlashcard(email, question, false);
      autoAdded = true;
    } catch (error) {
      flashcardSaveFailed = true;
      reportServerError("drill.vocab.auto_add_flashcard_failed", error, {
        provider: "supabase",
        source: "record-vocab-answer",
      });
    }
  }
  return {
    ...(await loadCurrentVocabAnswerResult(email, question, input.selectedWord)),
    autoAdded,
    flashcardSaveFailed,
  };
}

async function loadCurrentVocabAnswerResult(
  email: string,
  question: VocabQuestionRow,
  selectedWord: string,
): Promise<VocabAnswerResult> {
  const db = supabaseAdmin();
  const answer = correctWord(question) as string;
  const [set, progressRes, masteredRes] = await Promise.all([
    loadVocabSet(email),
    db
      .from("drill_question_progress")
      .select("best_score,mastered_at")
      .eq("email", email)
      .eq("question_id", question.id)
      .maybeSingle<{ best_score: number | null; mastered_at: string | null }>(),
    db
      .from("drill_question_progress")
      .select("question_id", { count: "exact", head: true })
      .eq("email", email)
      .eq("drill_slug", "vocab")
      .not("mastered_at", "is", null),
  ]);
  if (progressRes.error) throw databaseError("Could not reload word progress", progressRes.error);
  if (masteredRes.error) throw databaseError("Could not count mastered vocab words", masteredRes.error);
  const stored = parseState(set?.description ?? null);
  const streak = await loadVocabStreak(email, stored);
  let autoAdded = false;
  if (set && selectedWord !== answer && stored.autoAdd) {
    const saved = await db
      .from("flashcard_cards")
      .select("id", { count: "exact", head: true })
      .eq("set_id", set.id)
      .ilike("term", answer);
    if (saved.error) throw databaseError("Could not reload the vocab flashcard", saved.error);
    autoAdded = (saved.count ?? 0) > 0;
  }
  return {
    correct: selectedWord === answer,
    correctWord: answer,
    wordCorrectStreak: progressRes.data?.best_score ?? 0,
    mastered: Boolean(progressRes.data?.mastered_at),
    masteredCount: masteredRes.count ?? 0,
    currentStreak: streak.currentStreak,
    bestStreak: streak.bestStreak,
    autoAdded,
  };
}

export async function updateVocabAutoAdd(email: string, enabled: boolean): Promise<void> {
  const set = await loadVocabSet(email);
  const state = parseState(set?.description ?? null);
  await saveStoredState(email, { ...state, autoAdd: enabled });
}

export async function saveVocabFlashcard(email: string, questionId: string): Promise<void> {
  await saveQuestionAsFlashcard(email, await loadQuestion(questionId), true);
}

export async function removeVocabFlashcard(email: string, questionId: string): Promise<void> {
  const [set, question] = await Promise.all([loadVocabSet(email), loadQuestion(questionId)]);
  if (!set) return;
  const word = correctWord(question);
  if (!word) return;
  const { error } = await supabaseAdmin()
    .from("flashcard_cards")
    .delete()
    .eq("set_id", set.id)
    .ilike("term", word);
  if (error) throw databaseError("Could not remove the vocab flashcard", error);
}

export async function loadVocabFlashcardDeck(
  email: string,
): Promise<{ cards: VocabFlashcard[]; setId: string | null }> {
  const set = await loadVocabSet(email);
  if (!set) return { cards: [], setId: null };
  return {
    setId: set.id,
    cards: (await loadCards(set.id)).map((card) => ({
      word: card.term,
      prioritized: card.position < 0,
      ...decodeDefinition(card.definition),
    })),
  };
}

export async function loadVocabFlashcards(email: string): Promise<VocabFlashcard[]> {
  return (await loadVocabFlashcardDeck(email)).cards;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function importVocabFlashcards(
  email: string,
  entries: readonly VocabImportEntry[],
): Promise<VocabFlashcardImportOutcome> {
  const set = await ensureVocabSet(email);
  const db = supabaseAdmin();
  const existing = await loadCards(set.id);
  const byTerm = new Map(existing.map((card) => [card.term.toLocaleLowerCase(), card]));
  let nextPosition = nextVocabFlashcardPosition(
    existing.map((card) => card.position),
    false,
  );
  const updates: {
    id: string;
    set_id: string;
    position: number;
    term: string;
    definition: string;
  }[] = [];
  const inserts: { set_id: string; position: number; term: string; definition: string }[] = [];

  for (const entry of entries) {
    const card = byTerm.get(entry.word.toLocaleLowerCase());
    if (card) {
      updates.push({
        id: card.id,
        set_id: set.id,
        position: card.position,
        term: entry.word,
        definition: encodeDefinition(entry),
      });
    } else {
      inserts.push({
        set_id: set.id,
        position: nextPosition,
        term: entry.word,
        definition: encodeDefinition(entry),
      });
      nextPosition += 1;
    }
  }

  for (const batch of chunks(updates, 200)) {
    const { error } = await db.from("flashcard_cards").upsert(batch, { onConflict: "id" });
    if (error) throw databaseError("Could not update imported flashcards", error);
  }
  for (const batch of chunks(inserts, 200)) {
    const { error } = await db.from("flashcard_cards").insert(batch);
    if (error) throw databaseError("Could not import flashcards", error);
  }
  return {
    imported: entries.length,
    inserted: inserts.length,
    updated: updates.length,
  };
}

export async function completeVocabSession(
  email: string,
  input: { durationSeconds: number; clientToken: string },
): Promise<AwardOutcome> {
  const db = supabaseAdmin();
  const summary = await summarizeDrillQuestionSession(email, "vocab", input.clientToken);
  if (summary.total !== VOCAB_SESSION_SIZE) {
    throw new Error(`A complete vocab session requires ${VOCAB_SESSION_SIZE} saved answers.`);
  }
  // Award first. A retry after a later module-attempt failure receives a zero-XP
  // duplicate award, then safely repairs the missing summary row.
  const award = await awardDrill(email, {
    drillSlug: "vocab",
    correct: summary.correct,
    total: summary.total,
    clientToken: input.clientToken,
  });
  const { error } = await db.from("module_attempts").insert({
    email,
    test_slug: "vocab",
    module_key: "vocab-drill",
    label: "Vocab Drill: 7 words",
    correct: summary.correct,
    total: summary.total,
    per_question_time: { durationSeconds: input.durationSeconds },
    client_token: input.clientToken,
  });
  if (error) {
    const { data: existing } = await db
      .from("module_attempts")
      .select("id")
      .eq("email", email)
      .eq("client_token", input.clientToken)
      .maybeSingle<{ id: string }>();
    if (!existing) throw databaseError("Could not save vocab session", error);
  }
  return award;
}
