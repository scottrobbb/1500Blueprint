"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DrillShell } from "../shared/DrillShell";
import { ProgressBar, formatClock } from "../shared/Hud";
import { TrophyIcon, FlameIcon } from "../shared/icons";
import { ClockIcon, CloseIcon } from "@/components/test/icons";
import { ReportQuestionButton } from "@/components/questions/ReportQuestionButton";
import { vocabItems, type VocabItem } from "./mock";
import { VocabQuestion } from "./VocabQuestion";
import { VocabSummary, type VocabSessionAnswer } from "./VocabSummary";
import { VocabProgressPanel } from "./VocabProgressPanel";
import {
  VOCAB_MASTERY_TARGET,
  advanceVocabProgress,
  selectVocabSession,
  type VocabAnswerResult,
  type VocabDashboardState,
  type VocabWordProgress,
} from "@/lib/drills/vocabProgress";

const ADVANCE_DELAY = 1400;

const EMPTY_DASHBOARD: VocabDashboardState = {
  totalWords: 0,
  masteredCount: 0,
  currentStreak: 0,
  bestStreak: 0,
  autoAddFlashcards: true,
  savedQuestionIds: [],
  bookmarkedQuestionIds: [],
  flashcardCount: 0,
  words: [],
  attempts: {
    last3: { accuracy: null, averageSeconds: null, sessions: 0 },
    last10: { accuracy: null, averageSeconds: null, sessions: 0 },
    all: { accuracy: null, averageSeconds: null, sessions: 0 },
  },
};

export function VocabDrill({
  items,
  wordBank,
  initialState,
  initialShowProgress = false,
  returnHref = "/drills",
}: {
  items?: VocabItem[];
  wordBank?: VocabItem[];
  initialState?: VocabDashboardState;
  initialShowProgress?: boolean;
  returnHref?: string;
}) {
  const data = items?.length ? items : vocabItems;
  const allWords = wordBank?.length ? wordBank : data;
  const tracked = Boolean(items?.length && initialState);
  const dashboard = initialState ?? { ...EMPTY_DASHBOARD, totalWords: data.length };
  const [sessionStart, setSessionStart] = useState(0);
  const sessionItems = useMemo(
    () => selectVocabSession(data, sessionStart),
    [data, sessionStart],
  );
  const wordToQuestionId = useMemo(
    () => new Map(allWords.map((entry) => [entry.correct.toLocaleLowerCase(), entry.id])),
    [allWords],
  );

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [masteredCount, setMasteredCount] = useState(dashboard.masteredCount);
  const [streak, setStreak] = useState(dashboard.currentStreak);
  const [bestStreak, setBestStreak] = useState(dashboard.bestStreak);
  const [seconds, setSeconds] = useState(0);
  const [savedIds, setSavedIds] = useState(() => new Set(dashboard.savedQuestionIds));
  const [bookmarkedIds, setBookmarkedIds] = useState(
    () => new Set(dashboard.bookmarkedQuestionIds),
  );
  const [deckCount, setDeckCount] = useState(dashboard.flashcardCount);
  const [autoAdd, setAutoAdd] = useState(dashboard.autoAddFlashcards);
  const [wordProgress, setWordProgress] = useState(dashboard.words);
  const [answers, setAnswers] = useState<VocabSessionAnswer[]>([]);
  const [done, setDone] = useState(false);
  const [showProgress, setShowProgress] = useState(initialShowProgress);
  const [error, setError] = useState<string | null>(null);
  const [settingsPending, setSettingsPending] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const answerTokenRef = useRef(crypto.randomUUID());
  const advanceRef = useRef<number | null>(null);
  const total = sessionItems.length;
  const item = sessionItems[index];

  useEffect(() => {
    if (done || showProgress) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [done, showProgress]);

  useEffect(() => {
    return () => {
      if (advanceRef.current !== null) window.clearTimeout(advanceRef.current);
    };
  }, []);

  function applyWordProgress(question: VocabItem, result: VocabAnswerResult) {
    setWordProgress((current) => {
      const next: VocabWordProgress = {
        questionId: question.id,
        word: result.correctWord,
        correctStreak: result.wordCorrectStreak,
        mastered: result.mastered,
      };
      const without = current.filter((entry) => entry.questionId !== question.id);
      return [next, ...without];
    });
  }

  async function finishSession(durationSeconds: number) {
    if (!tracked || total !== 7) return;
    try {
      const response = await fetch("/api/drills/vocab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationSeconds,
          clientToken: sessionTokenRef.current,
        }),
        keepalive: true,
      });
      if (!response.ok) throw new Error("Session progress could not be saved.");
    } catch {
      setError("Your answers are complete, but the session summary could not be saved. Refresh to retry.");
    }
  }

  async function handleSelect(word: string) {
    if (selected !== null || !item) return;
    setSelected(word);
    setError(null);

    let result: VocabAnswerResult;
    if (tracked) {
      try {
        const response = await fetch("/api/drills/vocab/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: item.id,
            selectedWord: word,
            clientToken: answerTokenRef.current,
            sessionToken: sessionTokenRef.current,
          }),
        });
        const body = (await response.json()) as VocabAnswerResult & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not save this answer.");
        result = body;
        answerTokenRef.current = crypto.randomUUID();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save this answer.");
        setSelected(null);
        return;
      }
    } else {
      const correct = word === item.correct;
      const previous = wordProgress.find((entry) => entry.questionId === item.id);
      const next = advanceVocabProgress(
        {
          wordCorrectStreak: previous?.correctStreak ?? 0,
          currentStreak: streak,
          bestStreak,
          mastered: previous?.mastered ?? false,
        },
        correct,
      );
      result = {
        correct,
        correctWord: item.correct,
        wordCorrectStreak: next.wordCorrectStreak,
        mastered: next.mastered,
        masteredCount: masteredCount + (next.mastered && !previous?.mastered ? 1 : 0),
        currentStreak: next.currentStreak,
        bestStreak: next.bestStreak,
        autoAdded: !correct && autoAdd,
      };
    }

    setMasteredCount(result.masteredCount);
    setStreak(result.currentStreak);
    setBestStreak(result.bestStreak);
    applyWordProgress(item, result);
    if (result.flashcardSaveFailed) {
      setError("Your answer was saved, but the missed word could not be added to flashcards.");
    }
    if (result.autoAdded) {
      const alreadySaved = savedIds.has(item.id);
      setSavedIds((current) => new Set(current).add(item.id));
      if (!alreadySaved) setDeckCount((count) => count + 1);
    }

    const answer: VocabSessionAnswer = {
      questionId: item.id,
      pos: item.pos,
      definition: item.definition,
      selectedWord: word,
      correctWord: result.correctWord,
      correct: result.correct,
      correctStreak: result.wordCorrectStreak,
      mastered: result.mastered,
    };
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    advanceRef.current = window.setTimeout(() => {
      if (index + 1 >= total) {
        setDone(true);
        void finishSession(seconds);
      } else {
        setIndex((value) => value + 1);
        setSelected(null);
      }
    }, ADVANCE_DELAY);
  }

  async function toggleSave(word: string) {
    const questionId = wordToQuestionId.get(word.toLocaleLowerCase());
    if (!questionId) {
      setError(`“${word}” is not available as a flashcard yet.`);
      return;
    }
    const wasBookmarked = bookmarkedIds.has(questionId);
    const wasSaved = savedIds.has(questionId);
    setBookmarkedIds((current) => {
      const next = new Set(current);
      if (wasBookmarked) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    setSavedIds((current) => {
      const next = new Set(current);
      if (wasBookmarked) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    if (wasBookmarked) setDeckCount((count) => Math.max(0, count - 1));
    else if (!wasSaved) setDeckCount((count) => count + 1);
    if (!tracked) return;
    try {
      const response = await fetch("/api/drills/vocab/flashcards", {
        method: wasBookmarked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setBookmarkedIds((current) => {
        const next = new Set(current);
        if (wasBookmarked) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
      if (wasBookmarked) setDeckCount((count) => count + 1);
      else if (!wasSaved) setDeckCount((count) => Math.max(0, count - 1));
      setError("The flashcard change could not be saved.");
    }
  }

  async function toggleAutoAdd() {
    if (settingsPending) return;
    const next = !autoAdd;
    setAutoAdd(next);
    if (!tracked) return;
    setSettingsPending(true);
    try {
      const response = await fetch("/api/drills/vocab/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoAddFlashcards: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setAutoAdd(!next);
      setError("The auto-add setting could not be saved.");
    } finally {
      setSettingsPending(false);
    }
  }

  function restart() {
    if (advanceRef.current !== null) window.clearTimeout(advanceRef.current);
    setSessionStart((value) => (value + 7) % Math.max(1, data.length));
    setIndex(0);
    setSelected(null);
    setSeconds(0);
    setAnswers([]);
    setDone(false);
    setError(null);
    sessionTokenRef.current = crypto.randomUUID();
    answerTokenRef.current = crypto.randomUUID();
  }

  const savedByWord = Object.fromEntries(
    allWords.map((entry) => [
      entry.correct,
      bookmarkedIds.has(entry.id),
    ]),
  );

  if (showProgress) {
    return (
      <DrillShell title="Vocab Progress" eyebrow="Vocabulary" exitHref={returnHref}>
        <VocabProgressPanel
          totalWords={dashboard.totalWords || data.length}
          masteredCount={masteredCount}
          currentStreak={streak}
          bestStreak={bestStreak}
          autoAdd={autoAdd}
          words={wordProgress}
          attempts={dashboard.attempts}
          settingsPending={settingsPending}
          onToggleAutoAdd={toggleAutoAdd}
          onStart={() => setShowProgress(false)}
        />
      </DrillShell>
    );
  }

  if (done) {
    return (
      <DrillShell
        title="Vocab Drill"
        eyebrow="Vocabulary"
        exitHref={returnHref}
        right={<ExitButton href={returnHref} />}
      >
        <VocabSummary
          answers={answers}
          seconds={seconds}
          savedCount={deckCount}
          error={error}
          onPracticeAgain={restart}
          returnHref={returnHref}
        />
      </DrillShell>
    );
  }

  const center = (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-navy/65">
      <ClockIcon className="h-4 w-4 text-navy/45" />
      Time: {formatClock(seconds)}
    </span>
  );
  const answered = selected !== null ? index + 1 : index;

  return (
    <DrillShell
      title="Vocab Drill"
      eyebrow="Vocabulary"
      exitHref={returnHref}
      center={center}
      right={(
        <div className="flex items-center gap-2">
          <ReportQuestionButton compact questionId={item.id} targetType="question-bank" />
          <ExitButton href={returnHref} />
        </div>
      )}
    >
      <div className="-mt-2 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-navy">
            Question {index + 1} of {total}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowProgress(true)}
              className="text-xs font-semibold text-brand-600 hover:text-brand"
            >
              View progress
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={autoAdd}
              aria-label="Automatically add missed words to flashcards"
              disabled={settingsPending}
              onClick={toggleAutoAdd}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-navy/15 bg-white px-3 text-xs font-semibold text-navy/65 shadow-sm transition-colors hover:border-navy/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:cursor-wait disabled:opacity-50"
            >
              <span>Auto-add missed words</span>
              <span
                aria-hidden="true"
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${autoAdd ? "bg-success" : "bg-navy/20"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${autoAdd ? "left-[22px]" : "left-0.5"}`} />
              </span>
              <span className={`w-6 text-left ${autoAdd ? "text-success-600" : "text-navy/45"}`}>
                {autoAdd ? "On" : "Off"}
              </span>
            </button>
          </div>
        </div>
        <div className="mt-2.5">
          <ProgressBar value={answered} max={total} />
        </div>
        <div className="mt-3 flex items-center gap-5 border-t border-navy/10 pt-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-navy/70">
            <TrophyIcon className="h-4 w-4 text-gold-600" />
            Words Mastered: <span className="font-semibold text-navy">{masteredCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-navy/70">
            <FlameIcon className="h-4 w-4 text-flag" />
            Streak: <span className="font-semibold text-navy">{streak}</span>
          </span>
          <span className="hidden text-xs text-navy/45 sm:inline">
            {VOCAB_MASTERY_TARGET} correct in a row masters a word
          </span>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-card border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger-600">
          {error}
        </div>
      ) : null}

      <VocabQuestion
        item={item}
        selected={selected}
        saved={savedByWord}
        onSelect={handleSelect}
        onToggleSave={toggleSave}
      />
    </DrillShell>
  );
}

function ExitButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Exit drill"
      title="Exit"
      className="inline-flex h-9 w-9 items-center justify-center rounded-card border border-navy/15 text-navy/55 transition-colors hover:bg-navy/5 hover:text-navy"
    >
      <CloseIcon className="h-5 w-5" />
    </Link>
  );
}
