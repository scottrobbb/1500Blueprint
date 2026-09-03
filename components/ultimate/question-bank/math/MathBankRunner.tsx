"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import { ExplanationText } from "@/components/test/ExplanationText";
import { MathText, isHighlightableText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import { HighlightablePassage, type Highlight } from "@/components/test/HighlightablePassage";
import { ReferenceModal } from "@/components/test/ReferenceModal";
import { ReportQuestionButton } from "@/components/questions/ReportQuestionButton";
import { normalizeGridInInput } from "@/lib/sat/gridIn";
import {
  nextQuestionBankAttemptState,
  type MathAttemptResult,
  type MathRunnerQuestion,
  type QuestionBankAttemptState,
  type QuestionBankLevel,
  type QuestionBankOutcome,
  type QuestionBankRunnerState,
} from "@/lib/question-bank/math";
import type { MathSessionFilters } from "@/lib/question-bank/math-queries";
import {
  addHighlight as addHighlightTo,
  removeHighlight as removeHighlightFrom,
  setHighlightNote as setNoteOn,
  promptHighlightKey,
} from "@/lib/sat/highlights";

type RunnerResult = MathAttemptResult & { response: string };
type ToolPanel = "calculator" | "reference" | "directions" | null;
type BankSubject = "math" | "reading-writing";
type BankRunnerQuestion = Omit<MathRunnerQuestion, "domain"> & { domain: string };
type BankRunnerProps = {
  questions: BankRunnerQuestion[];
  filters: MathSessionFilters;
  initialState: QuestionBankRunnerState;
  returnHref?: string;
  plannerTaskId?: string;
  isAdmin?: boolean;
};

export function MathBankRunner({
  questions,
  filters,
  initialState,
  returnHref,
  plannerTaskId,
  isAdmin,
}: BankRunnerProps) {
  return <ObjectiveBankRunner questions={questions} filters={filters} initialState={initialState} returnHref={returnHref} plannerTaskId={plannerTaskId} isAdmin={isAdmin} subject="math" />;
}

export function ReadingWritingBankRunner({ questions, filters, initialState, returnHref, plannerTaskId, isAdmin }: BankRunnerProps) {
  return <ObjectiveBankRunner questions={questions} filters={filters} initialState={initialState} returnHref={returnHref} plannerTaskId={plannerTaskId} isAdmin={isAdmin} subject="reading-writing" />;
}

function ObjectiveBankRunner({
  questions,
  filters,
  initialState,
  returnHref,
  plannerTaskId,
  isAdmin,
  subject,
}: BankRunnerProps & { subject: BankSubject }) {
  // Per-sitting storage is keyed by what decides the set of questions. For an
  // ordinary session that is the filters; a Study Planner task carries a fixed
  // set of its own, so it is keyed by the task instead -- two tasks over the
  // same skill hold different questions and must not share a key.
  const stateKey = plannerTaskId
    ? `task:${plannerTaskId}`
    : `${subject}:${filters.difficulty}:${filters.completion}:${[...filters.skills].sort().join(",")}`;
  // The server re-sorts "unattempted first" on every fetch, so a plain
  // refresh (which re-fetches) would reshuffle every question's number as
  // soon as one gets attempted. Lock in the order the first time this
  // filter set loads in a session, and reuse it on subsequent loads --
  // new/removed questions are reconciled against the saved id list rather
  // than trusting the freshly-fetched order.
  const orderKey = `qb-order:${stateKey}`;
  const [orderedQuestions] = useState<BankRunnerQuestion[]>(() => {
    if (typeof window === "undefined") return questions;
    try {
      const raw = window.sessionStorage.getItem(orderKey);
      if (!raw) {
        window.sessionStorage.setItem(orderKey, JSON.stringify(questions.map((item) => item.id)));
        return questions;
      }
      const savedIds = JSON.parse(raw) as string[];
      const remaining = new Map(questions.map((item) => [item.id, item]));
      const ordered: BankRunnerQuestion[] = [];
      for (const id of savedIds) {
        const found = remaining.get(id);
        if (found) {
          ordered.push(found);
          remaining.delete(id);
        }
      }
      for (const item of questions) {
        if (remaining.has(item.id)) ordered.push(item);
      }
      window.sessionStorage.setItem(orderKey, JSON.stringify(ordered.map((item) => item.id)));
      return ordered;
    } catch {
      return questions;
    }
  });

  // Resume on the same question after a refresh. Keyed by the session (not a
  // raw index -- the saved question id is re-located in the ordered list
  // rather than trusted as a slot).
  const positionKey = `qb-position:${stateKey}`;
  const [currentIndex, setCurrentIndex] = useState(() => {
    // A planner task is reopened days later with the questions already
    // answered still in its set, so Continue starts on the first question the
    // student has not answered instead of back at question 1.
    const resumeIndex = plannerTaskId ? firstUnansweredIndex(orderedQuestions, initialState.outcomes) : 0;
    if (typeof window === "undefined") return resumeIndex;
    try {
      const savedId = window.sessionStorage.getItem(positionKey);
      if (!savedId) return resumeIndex;
      const index = orderedQuestions.findIndex((item) => item.id === savedId);
      return index > 0 ? index : resumeIndex;
    } catch {
      return resumeIndex;
    }
  });
  // Attempt state is per sitting, not per account. Seeding it from the
  // database re-selected the student's previous answer and re-marked every
  // choice they had got wrong, which gives the answer away on a re-attempt.
  // Session storage keeps the recap and navigator honest across a mid-session
  // refresh -- the concern the counters below were written for -- while a
  // later sitting, a new tab, or a different filter set starts clean.
  const attemptsKey = `qb-attempts:${stateKey}`;
  const [attempts, setAttempts] = useState<Record<string, QuestionBankAttemptState>>(
    () => readStoredAttempts(attemptsKey),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(attempts));
  const [results, setResults] = useState<Record<string, RunnerResult>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(attemptsKey, JSON.stringify(attempts));
    } catch {
      // A full or unavailable session store only costs the refresh recap.
    }
  }, [attemptsKey, attempts]);
  const [marked, setMarked] = useState<Set<string>>(() => new Set(initialState.savedQuestionIds));
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [highlightOn, setHighlightOn] = useState(false);
  // The Highlight tool used to only recolour the browser's own selection, so a
  // "highlight" vanished the moment the student clicked anywhere else. These
  // are real, per-question highlights, keyed the same way the practice test
  // runner keys its own.
  const [highlights, setHighlights] = useState<Record<string, Highlight[]>>({});

  function addHighlight(questionId: string, highlight: Highlight) {
    setHighlights((prev) => addHighlightTo(prev, questionId, highlight));
  }
  function removeHighlight(questionId: string, start: number, end: number) {
    setHighlights((prev) => removeHighlightFrom(prev, questionId, start, end));
  }
  function setHighlightNote(questionId: string, id: string, note: string) {
    setHighlights((prev) => setNoteOn(prev, questionId, id, note));
  }
  const [paused, setPaused] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [eliminatorOn, setEliminatorOn] = useState(false);
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({});
  const enteredQuestionAt = useRef(0);
  const sessionId = useRef<string | null>(null);
  const attemptTokens = useRef<Record<string, { response: string; token: string }>>({});
  const question = orderedQuestions[currentIndex];
  // A passage is only highlightable when its rendered output is its source
  // string: KaTeX's MathML and importer tables both break the offset mapping
  // that highlighting depends on. isHighlightableText is the same test the
  // prompt uses -- an earlier version checked only for tables, which sent
  // passages holding LaTeX to the renderer that prints it literally.
  const passageHighlightable = isHighlightableText(question?.passage ?? "");
  // Prompts highlight on the same terms as passages: plain text only, since
  // rendered math breaks the offset mapping the selection relies on.
  const promptHighlightable = isHighlightableText(question?.prompt ?? "");
  const answer = question ? answers[question.id] ?? "" : "";
  const result = question ? results[question.id] : undefined;

  // Restarting the interval on currentIndex keeps the first tick after a reset
  // a full second, rather than whatever was left of the previous one.
  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [paused, currentIndex]);

  // Mount only. Every later question starts its clock in goTo, the single
  // caller of setCurrentIndex, so the reset lives in the event that moves the
  // student rather than in an effect reacting to it.
  useEffect(() => {
    enteredQuestionAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || finished) return;
    const current = orderedQuestions[currentIndex];
    if (!current) return;
    try {
      window.sessionStorage.setItem(positionKey, current.id);
    } catch {
      // Storage unavailable -- position just won't survive a refresh.
    }
  }, [currentIndex, orderedQuestions, finished, positionKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !finished) return;
    try {
      window.sessionStorage.removeItem(positionKey);
    } catch {
      // No-op.
    }
  }, [finished, positionKey]);

  // Enter checks the current answer, from anywhere on the page (typing a
  // grid-in response, or after clicking a multiple-choice option). checkAnswer
  // already no-ops when there's nothing to submit, so this is safe to fire
  // unconditionally while a question is active.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || finished || paused || navigatorOpen || toolPanel) return;
      void checkAnswer();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function setAnswer(value: string) {
    if (!question || result?.revealed) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setSubmitError(null);
    setExplanationOpen(false);
  }

  async function toggleMarked() {
    if (!question || savingQuestion) return;
    const wasSaved = marked.has(question.id);
    const shouldSave = !wasSaved;
    setSaveError(null);
    setSavingQuestion(true);
    setMarked((current) => {
      const next = new Set(current);
      if (shouldSave) next.add(question.id);
      else next.delete(question.id);
      return next;
    });

    try {
      const response = await fetch("/api/question-bank/saves", {
        method: shouldSave ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      if (!response.ok) throw new Error("Could not save this question.");
    } catch (error) {
      setMarked((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(question.id);
        else next.delete(question.id);
        return next;
      });
      setSaveError(error instanceof Error ? error.message : "Could not save this question.");
    } finally {
      setSavingQuestion(false);
    }
  }

  function goTo(index: number) {
    // The timer is per question, not per session, so it reads as pace on the
    // question in front of the student. Resetting the display alongside
    // enteredQuestionAt keeps it honest about the durationMs sent on submit.
    setElapsedSeconds(0);
    enteredQuestionAt.current = Date.now();
    setSubmitError(null);
    setSaveError(null);
    setCurrentIndex(Math.max(0, Math.min(index, orderedQuestions.length - 1)));
    setNavigatorOpen(false);
    setFinished(false);
    setExplanationOpen(false);
  }

  function goNext() {
    if (currentIndex >= orderedQuestions.length - 1) setFinished(true);
    else goTo(currentIndex + 1);
  }

  async function checkAnswer() {
    if (!question || !answer.trim() || result?.revealed || submitting) return;
    // Multiple choice disables a choice once it is marked wrong, so a repeat
    // there is always a stray double-submit rather than a real second attempt.
    if (question.answerType !== "grid_in" && result?.response === answer) return;
    setSubmitting(true);
    setSubmitError(null);
    sessionId.current ??= createToken();
    const previousToken = attemptTokens.current[question.id];
    const clientToken = previousToken?.response === answer ? previousToken.token : createToken();
    attemptTokens.current[question.id] = { response: answer, token: clientToken };

    try {
      const response = await fetch(`/api/question-bank/${subject}/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          response: answer,
          durationMs: Date.now() - enteredQuestionAt.current,
          sessionId: sessionId.current,
          clientToken,
        }),
      });
      const body = (await response.json()) as Partial<MathAttemptResult> & { error?: string };
      if (!response.ok || typeof body.correct !== "boolean") {
        throw new Error(body.error || "We could not check that answer.");
      }
      const correct = body.correct;
      // A first miss comes back without an explanation or correct answer --
      // the student gets another try before the solution is unlocked.
      const revealed = body.revealed === true;
      setResults((current) => ({
        ...current,
        [question.id]: {
          correct,
          revealed,
          explanation: revealed ? body.explanation ?? "A full solution is not available yet." : "",
          correctAnswer: revealed ? body.correctAnswer ?? "" : "",
          response: answer,
        },
      }));
      setAttempts((current) => ({
        ...current,
        [question.id]: nextQuestionBankAttemptState(current[question.id], correct, answer),
      }));
      setExplanationOpen(revealed);
      delete attemptTokens.current[question.id];
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We could not check that answer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (orderedQuestions.length === 0) {
    return <EmptySession filters={filters} subject={subject} />;
  }

  // The navigator marks and the recap show every sitting, so a question the
  // student answered last week still reads as done. This sitting wins where
  // both have an entry, because it is the fresher result. Only the outcome is
  // merged in -- `attempts` keeps the chosen answer and the wrong choices, and
  // that half stays scoped to this sitting.
  const navigatorOutcomes: Record<string, QuestionBankOutcome> = { ...initialState.outcomes, ...attempts };
  const checkedCount = Object.keys(navigatorOutcomes).length;
  const correctCount = Object.values(navigatorOutcomes).filter((item) => item.correct).length;
  const questionStrip = (
    <QuestionStrip
      questionId={question.id}
      index={currentIndex}
      marked={marked.has(question.id)}
      saving={savingQuestion}
      saveError={saveError}
      eliminatorOn={eliminatorOn}
      onToggleMarked={() => void toggleMarked()}
      onToggleEliminator={() => setEliminatorOn((value) => !value)}
    />
  );
  const answerArea = (
    <AnswerArea
      question={question}
      answer={answer}
      result={result}
      attempt={attempts[question.id]}
      submitting={submitting}
      submitError={submitError}
      explanationOpen={explanationOpen}
      eliminatorOn={eliminatorOn}
      eliminatedChoices={eliminated[question.id] ?? []}
      onAnswer={setAnswer}
      onCheck={checkAnswer}
      onToggleExplanation={() => setExplanationOpen((value) => !value)}
      onToggleEliminated={(choiceId) => {
        setEliminated((current) => {
          const currentChoices = current[question.id] ?? [];
          const nextChoices = currentChoices.includes(choiceId)
            ? currentChoices.filter((id) => id !== choiceId)
            : [...currentChoices, choiceId];
          return { ...current, [question.id]: nextChoices };
        });
        if (answer === choiceId) setAnswer("");
      }}
    />
  );

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-white text-[#111]">
      <RunnerHeader
        subject={subject}
        elapsedSeconds={elapsedSeconds}
        timerHidden={timerHidden}
        paused={paused}
        highlightOn={highlightOn}
        canHighlight={passageHighlightable}
        toolPanel={toolPanel}
        onTogglePause={() => setPaused((value) => !value)}
        onToggleTimer={() => setTimerHidden((value) => !value)}
        onToggleHighlight={() => setHighlightOn((value) => !value)}
        onOpenTool={(tool) => setToolPanel((current) => current === tool ? null : tool)}
      />

      {finished ? (
        <SessionSummary
          subject={subject}
          total={orderedQuestions.length}
          answered={checkedCount}
          correct={correctCount}
          marked={marked.size}
          returnHref={returnHref}
          onReview={() => {
            setFinished(false);
            setNavigatorOpen(true);
          }}
        />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto bg-white">
          {subject === "reading-writing" ? (
            <div className={`grid min-h-full selection:bg-[#ffe37a] lg:grid-cols-2 ${highlightOn ? "cursor-text" : ""}`}>
              <section aria-label="Reading passage" className="border-b border-[#e3e3e3] bg-[#fcfcfc] px-5 py-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10 xl:px-[7.5vw]">
                <div className="mx-auto max-w-2xl">
                  {highlightOn && passageHighlightable && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#fff4bd] px-3 py-2 text-xs font-semibold text-[#555]">
                      <HighlightIcon className="h-4 w-4" /> Select text to highlight while you work.
                    </div>
                  )}
                  {question.passage && (passageHighlightable ? (
                    <HighlightablePassage
                      text={question.passage ?? ""}
                      highlights={highlights[question.id] ?? []}
                      enabled={highlightOn}
                      onAdd={(highlight) => addHighlight(question.id, highlight)}
                      onRemove={(start, end) => removeHighlight(question.id, start, end)}
                      onSetNote={(id, note) => setHighlightNote(question.id, id, note)}
                      className="!text-[18px] !leading-[1.65] !text-[#111]"
                    />
                  ) : (
                    <QuestionContent text={question.passage} pClassName="font-serif text-[18px] leading-[1.65] text-[#111]" />
                  ))}
                  {question.figureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={question.figureUrl} alt="Figure for this question" width={1200} height={800} className="mt-6 h-auto max-h-[420px] max-w-full object-contain" />
                  )}
                </div>
              </section>
              <article className="px-4 py-6 sm:px-7 lg:px-6 lg:py-6 xl:px-10">
                <div className="mx-auto max-w-2xl">
                  {questionStrip}
                  <div className="px-1 py-5 sm:px-0">
                    {promptHighlightable ? (
                      <HighlightablePassage
                        text={question.prompt}
                        highlights={highlights[promptHighlightKey(question.id)] ?? []}
                        enabled={highlightOn}
                        onAdd={(highlight) => addHighlight(promptHighlightKey(question.id), highlight)}
                        onRemove={(start, end) => removeHighlight(promptHighlightKey(question.id), start, end)}
                        onSetNote={(id, note) => setHighlightNote(promptHighlightKey(question.id), id, note)}
                        className="!text-[17px] !leading-[1.55] !text-[#111] sm:!text-[18px]"
                      />
                    ) : (
                      <QuestionContent text={question.prompt} pClassName="font-serif text-[17px] leading-[1.55] text-[#111] sm:text-[18px]" />
                    )}
                    {answerArea}
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <article className={`mx-auto w-full max-w-3xl px-4 py-8 selection:bg-[#ffe37a] sm:px-0 sm:py-11 ${highlightOn ? "cursor-text" : ""}`}>
              {questionStrip}
              <div className="px-1 py-5 sm:px-0">
                {highlightOn && passageHighlightable && (
                  <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#fff4bd] px-3 py-2 text-xs font-semibold text-[#555]">
                    <HighlightIcon className="h-4 w-4" /> Select text to highlight while you work.
                  </div>
                )}
                {question.passage && (passageHighlightable ? (
                  <div className="mb-4">
                    <HighlightablePassage
                      text={question.passage}
                      highlights={highlights[question.id] ?? []}
                      enabled={highlightOn}
                      onAdd={(highlight) => addHighlight(question.id, highlight)}
                      onRemove={(start, end) => removeHighlight(question.id, start, end)}
                      onSetNote={(id, note) => setHighlightNote(question.id, id, note)}
                      className="!leading-7 !text-[#111]"
                    />
                  </div>
                ) : (
                  <QuestionContent text={question.passage} pClassName="mb-4 font-serif text-[17px] leading-7 text-[#111]" />
                ))}
                {question.figureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={question.figureUrl} alt="Figure for this question" width={1200} height={800} className="mb-5 h-auto max-h-80 max-w-full object-contain" />
                )}
                {promptHighlightable ? (
                      <HighlightablePassage
                        text={question.prompt}
                        highlights={highlights[promptHighlightKey(question.id)] ?? []}
                        enabled={highlightOn}
                        onAdd={(highlight) => addHighlight(promptHighlightKey(question.id), highlight)}
                        onRemove={(start, end) => removeHighlight(promptHighlightKey(question.id), start, end)}
                        onSetNote={(id, note) => setHighlightNote(promptHighlightKey(question.id), id, note)}
                        className="!text-[17px] !leading-[1.55] !text-[#111] sm:!text-[18px]"
                      />
                    ) : (
                      <QuestionContent text={question.prompt} pClassName="font-serif text-[17px] leading-[1.55] text-[#111] sm:text-[18px]" />
                    )}
                {answerArea}
              </div>
            </article>
          )}
        </main>
      )}

      <RunnerFooter
        currentIndex={currentIndex}
        total={orderedQuestions.length}
        canGoPrevious={!finished && currentIndex > 0}
        nextLabel={currentIndex === orderedQuestions.length - 1 ? "Finish" : "Next"}
        finished={finished}
        navigatorOpen={navigatorOpen}
        editHref={isAdmin && !finished ? `/ultimate/admin/questions/${question.id}` : undefined}
        onPrevious={() => goTo(currentIndex - 1)}
        onNext={goNext}
        onToggleNavigator={() => setNavigatorOpen((value) => !value)}
      />

      {navigatorOpen && (
        <RunnerNavigator
          questions={orderedQuestions}
          currentIndex={currentIndex}
          outcomes={navigatorOutcomes}
          marked={marked}
          onGoTo={goTo}
          onClose={() => setNavigatorOpen(false)}
        />
      )}
      {paused && <PausedOverlay onResume={() => setPaused(false)} />}
      {toolPanel === "calculator" && <CalculatorPanel onClose={() => setToolPanel(null)} />}
      {toolPanel === "reference" && <ReferenceModal onClose={() => setToolPanel(null)} />}
      {toolPanel === "directions" && <DirectionsPanel subject={subject} onClose={() => setToolPanel(null)} />}
    </div>
  );
}

function RunnerHeader({
  subject,
  elapsedSeconds,
  timerHidden,
  paused,
  highlightOn,
  canHighlight,
  toolPanel,
  onTogglePause,
  onToggleTimer,
  onToggleHighlight,
  onOpenTool,
}: {
  subject: BankSubject;
  elapsedSeconds: number;
  timerHidden: boolean;
  paused: boolean;
  highlightOn: boolean;
  canHighlight: boolean;
  toolPanel: ToolPanel;
  onTogglePause: () => void;
  onToggleTimer: () => void;
  onToggleHighlight: () => void;
  onOpenTool: (tool: Exclude<ToolPanel, null>) => void;
}) {
  const catalogHref = subject === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing";
  const subjectLabel = subject === "math" ? "Math" : "Reading & Writing";

  return (
    <header className="relative z-20 border-b border-[#e8e8e8] bg-white px-3 py-2 sm:px-5">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[1fr_auto] items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-1 sm:gap-3">
          <Link href={catalogHref} aria-label={`Go back to ${subjectLabel} topics`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#737373] hover:bg-[#f4f4f4] hover:text-[#222] sm:px-3 sm:text-sm">
            <ArrowLeftIcon className="h-4 w-4" /> <span className="hidden sm:inline">Go back</span>
          </Link>
          <button type="button" onClick={() => onOpenTool("directions")} className="hidden min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#737373] hover:bg-[#f4f4f4] hover:text-[#222] sm:inline-flex">
            Directions <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-lg font-bold tabular-nums text-[#111] sm:text-xl">
            {timerHidden ? "--:--" : formatTime(elapsedSeconds)}
          </span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={onTogglePause} aria-label={paused ? "Resume timer" : "Pause timer"} className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dedede] text-[#8b8b8b] hover:border-[#9b9b9b] hover:text-[#333]">
              {paused ? <PlayIcon className="h-3.5 w-3.5" /> : <PauseIcon className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={onToggleTimer} className="rounded-full border border-[#dedede] px-2.5 py-1 text-[10px] font-semibold text-[#777] hover:border-[#9b9b9b] hover:text-[#333]">
              {timerHidden ? "Show" : "Hide"}
            </button>
          </span>
        </div>

        <nav aria-label={`${subjectLabel} tools`} className="col-span-2 flex items-center justify-end gap-1 border-t border-[#ededed] pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
          <ToolButton label="Highlight" active={highlightOn} onClick={onToggleHighlight} disabled={!canHighlight}><HighlightIcon className="h-5 w-5" /></ToolButton>
          {subject === "math" && <ToolButton label="Calculator" active={toolPanel === "calculator"} onClick={() => onOpenTool("calculator")}><CalculatorIcon className="h-5 w-5" /></ToolButton>}
          {subject === "math" && <ToolButton label="Reference" active={toolPanel === "reference"} onClick={() => onOpenTool("reference")}><ReferenceIcon className="h-5 w-5" /></ToolButton>}
        </nav>
      </div>
    </header>
  );
}

function ToolButton({ label, active, onClick, children, disabled = false }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} title={label === "Calculator" ? "Open graphing calculator" : label} className={`inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg px-2 text-[9px] font-semibold transition-colors sm:min-w-[66px] sm:text-[10px] ${active ? "bg-white text-[#555] ring-2 ring-[#8d8d8d]" : "text-[#888] hover:bg-[#f5f5f5] hover:text-[#333]"} ${disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[#888]" : ""}`}>
      {children}<span className="mt-0.5 hidden sm:block">{label}</span>
    </button>
  );
}

// The set a planner task replays keeps every question the student has already
// answered, so the first one without an outcome is where they left off. A set
// with nothing left opens at the start, on its way to the recap.
function firstUnansweredIndex(
  questions: BankRunnerQuestion[],
  outcomes: Record<string, QuestionBankOutcome>,
): number {
  const index = questions.findIndex((question) => !outcomes[question.id]);
  return index > 0 ? index : 0;
}

function QuestionStrip({ questionId, index, marked, saving, saveError, eliminatorOn, onToggleMarked, onToggleEliminator }: { questionId: string; index: number; marked: boolean; saving: boolean; saveError: string | null; eliminatorOn: boolean; onToggleMarked: () => void; onToggleEliminator: () => void }) {
  return (
    <div className="flex min-h-[52px] overflow-hidden rounded-[9px] bg-[#f3f3f3]">
      <span className="grid w-[52px] flex-none place-items-center bg-black text-xl font-semibold text-white">{index + 1}</span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3">
        <div className="min-w-0">
          <button type="button" onClick={onToggleMarked} disabled={saving} aria-pressed={marked} className={`inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 text-left text-sm font-semibold disabled:cursor-wait disabled:opacity-60 sm:text-base ${marked ? "text-[#d97706]" : "text-[#222] hover:text-black"}`}>
            <BookmarkIcon filled={marked} className="h-5 w-5 flex-none" />
            <span className="truncate">{saving ? "Saving…" : "Mark for Review"}</span>
          </button>
          {saveError && <p role="alert" className="-mt-1 text-[11px] font-semibold text-[#dc2626]">{saveError}</p>}
        </div>
        <div className="flex items-center gap-1 text-[#777]">
          <ReportQuestionButton compact questionId={questionId} targetType="question-bank" className="h-10 min-h-10 w-10 border-[#d7d7d7] px-0 text-[#666] hover:border-[#aaa] hover:bg-white" />
          <button type="button" onClick={onToggleEliminator} aria-pressed={eliminatorOn} aria-label="Toggle answer eliminator" title="Answer eliminator" className={`grid h-10 w-10 place-items-center rounded-[9px] ${eliminatorOn ? "bg-[#161616] text-white" : "bg-black text-white hover:bg-[#333]"}`}><EliminateIcon className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}

function AnswerArea({ question, answer, result, attempt, submitting, submitError, explanationOpen, eliminatorOn, eliminatedChoices, onAnswer, onCheck, onToggleExplanation, onToggleEliminated }: { question: BankRunnerQuestion; answer: string; result: RunnerResult | undefined; attempt: QuestionBankAttemptState | undefined; submitting: boolean; submitError: string | null; explanationOpen: boolean; eliminatorOn: boolean; eliminatedChoices: string[]; onAnswer: (value: string) => void; onCheck: () => void; onToggleExplanation: () => void; onToggleEliminated: (choiceId: string) => void }) {
  const isMultipleChoice = question.answerType === "mc_single";
  const resultForAnswer = result?.response === answer ? result : undefined;
  const revealed = result?.revealed === true;
  const awaitingRetry = result !== undefined && !result.correct && !revealed;

  return (
    <div className="mt-6">
      {isMultipleChoice ? (
        <ul className="space-y-3.5">
          {question.choices.map((choice) => {
            const selected = answer === choice.id;
            const correctSelected = selected && resultForAnswer?.correct;
            const incorrectSelected = attempt?.incorrectResponses.includes(choice.id) === true;
            const eliminated = eliminatedChoices.includes(choice.id);
            return (
              <li key={choice.id} className="flex items-center gap-3">
                <div className={`flex min-h-[54px] min-w-0 flex-1 items-center rounded-[10px] border px-1.5 transition-colors ${correctSelected ? "border-2 border-[#138a50] bg-[#e8f7ef]" : incorrectSelected ? "border-2 border-[#dc2626] bg-[#fee2e2]" : selected ? "border-2 border-[#139ee9] bg-white" : "border-[#2e2e2e] bg-white hover:bg-[#fafafa]"} ${eliminated ? "opacity-45" : ""}`}>
                  <button type="button" disabled={revealed || incorrectSelected || eliminated || submitting} onClick={() => onAnswer(choice.id)} aria-pressed={selected} className="flex min-h-[50px] min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-2 text-left disabled:cursor-not-allowed">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-full border text-sm font-semibold ${correctSelected ? "border-[#138a50] bg-[#138a50] text-white" : incorrectSelected ? "border-[#dc2626] bg-[#dc2626] text-white" : selected ? "border-[#139ee9] bg-[#139ee9] text-white" : "border-[#2e2e2e] text-[#111]"}`}>
                      {incorrectSelected ? <CloseIcon className="h-4 w-4" /> : correctSelected ? <CheckIcon className="h-4 w-4" /> : choice.id}
                    </span>
                    <span className={`min-w-0 flex-1 whitespace-pre-line font-serif text-[17px] leading-6 text-[#111] ${eliminated ? "line-through" : ""}`}><MathText>{choice.text}</MathText></span>
                  </button>
                  {selected && !resultForAnswer && !revealed && (
                    <button type="button" onClick={() => void onCheck()} disabled={submitting} className="mr-1 rounded-lg bg-[#1aa8ef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1096d8] disabled:opacity-60">{submitting ? "Checking…" : "Check"}</button>
                  )}
                </div>
                {eliminatorOn && (
                  <button type="button" onClick={() => onToggleEliminated(choice.id)} aria-label={`${eliminated ? "Restore" : "Eliminate"} choice ${choice.id}`} className={`relative grid h-9 w-9 flex-none place-items-center rounded-full border border-[#222] text-sm font-semibold ${eliminated ? "bg-[#ededed] text-[#888]" : "bg-white text-[#111]"}`}>
                    {choice.id}<span className="absolute h-px w-11 bg-current" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="max-w-md">
          <label htmlFor="math-response" className="mb-2 block text-sm font-semibold text-[#222]">Enter your answer</label>
          <div className={`flex min-h-[54px] items-center rounded-[10px] border bg-white p-1.5 transition-[border-color,box-shadow] duration-200 ${resultForAnswer?.correct ? "border-2 border-[#138a50] bg-[#e8f7ef]" : resultForAnswer && !resultForAnswer.correct ? "border-2 border-[#dc2626] bg-[#fee2e2]" : "border-[#777] focus-within:border-[#139ee9] focus-within:ring-2 focus-within:ring-[#139ee9]/20"}`}>
            <input
              id="math-response"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={answer}
              disabled={revealed}
              onChange={(event) => onAnswer(normalizeGridInInput(event.target.value))}
              placeholder="Answer"
              className="min-w-0 flex-1 bg-transparent px-3 font-serif text-lg text-[#111] outline-none placeholder:text-[#aaa] focus-visible:outline-none"
            />
            {!revealed ? (
              <button type="button" disabled={!answer.trim() || submitting} onClick={() => void onCheck()} className="min-h-10 rounded-lg bg-[#1aa8ef] px-4 text-sm font-semibold text-white hover:bg-[#1096d8] disabled:cursor-not-allowed disabled:bg-[#d6dae1] disabled:text-[#929db0]">{submitting ? "Checking…" : "Check"}</button>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#888]">Use a decimal or fraction. Do not enter commas, symbols, or units.</p>
        </div>
      )}

      {submitError && <p role="alert" className="mt-4 text-sm font-semibold text-[#dc2626]">{submitError}</p>}

      {awaitingRetry && (
        <p role="status" className="mt-5 rounded-[10px] border border-[#f0c9a0] bg-[#fff6ec] px-4 py-3 text-sm font-semibold leading-6 text-[#a4530f]">
          That is not correct. Try again — the answer and explanation appear after your second attempt.
        </p>
      )}

      {revealed && !explanationOpen && (
        <button type="button" onClick={onToggleExplanation} className="mt-5 min-h-11 rounded-[10px] border border-[#d6d6d6] bg-white px-5 text-sm font-semibold text-[#555] hover:bg-[#f7f7f7]">
          Show explanation
        </button>
      )}

      {revealed && explanationOpen && result && (
        <div className="mt-5 rounded-[10px] border border-[#d7d7d7] bg-[#fafafa] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-white ${result.correct ? "bg-[#138a50]" : "bg-[#dc2626]"}`}>{result.correct ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}</span>
              <h2 className="text-base font-semibold">{result.correct ? "Correct" : `Correct answer: ${result.correctAnswer}`}</h2>
            </div>
            <button type="button" onClick={onToggleExplanation} aria-label="Close explanation" className="grid h-9 w-9 place-items-center rounded-md text-[#777] hover:bg-[#eee] hover:text-black"><CloseIcon className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 border-t border-[#dedede] pt-4 font-serif text-[16px] leading-7 text-[#222]"><ExplanationText text={result.explanation} /></div>
        </div>
      )}
    </div>
  );
}

function RunnerFooter({ currentIndex, total, canGoPrevious, nextLabel, finished, navigatorOpen, editHref, onPrevious, onNext, onToggleNavigator }: { currentIndex: number; total: number; canGoPrevious: boolean; nextLabel: string; finished: boolean; navigatorOpen: boolean; editHref?: string; onPrevious: () => void; onNext: () => void; onToggleNavigator: () => void }) {
  return (
    <footer className="relative z-20 border-t border-[#e8e8e8] bg-white px-3 py-3 sm:px-6">
      <div className="mx-auto grid max-w-[1170px] grid-cols-[auto_1fr_auto] items-center gap-3">
        <button type="button" onClick={onToggleNavigator} aria-expanded={navigatorOpen} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#171717] px-4 text-xs font-semibold text-white hover:bg-black sm:min-w-[150px] sm:justify-center sm:text-sm">
          {finished ? "Review" : `${currentIndex + 1} of ${total}`} <ChevronUpIcon className={`h-4 w-4 transition-transform ${navigatorOpen ? "rotate-180" : ""}`} />
        </button>
        <p className="hidden text-center text-xs font-medium text-[#777] sm:block">Use the question menu to jump or review marked items.</p>
        <div className="flex items-center gap-2">
          {editHref && (
            <Link href={editHref} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-[10px] border border-brand/30 bg-brand/5 px-4 text-sm font-semibold text-brand-600 hover:bg-brand/10 sm:px-6 flex items-center">
              Edit
            </Link>
          )}
          <button type="button" onClick={onPrevious} disabled={!canGoPrevious} className="min-h-11 rounded-[10px] border border-[#d6d6d6] px-4 text-sm font-semibold text-[#555] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:text-[#c8c8c8] sm:px-6">Previous</button>
          {!finished && <button type="button" onClick={onNext} className="min-h-11 rounded-[10px] border border-[#d6d6d6] bg-white px-5 text-sm font-semibold text-[#555] hover:bg-[#f7f7f7] sm:px-7">{nextLabel}</button>}
        </div>
      </div>
    </footer>
  );
}

function RunnerNavigator({ questions, currentIndex, outcomes, marked, onGoTo, onClose }: { questions: BankRunnerQuestion[]; currentIndex: number; outcomes: Record<string, QuestionBankOutcome>; marked: Set<string>; onGoTo: (index: number) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close question navigator" onClick={onClose} className="fixed inset-0 z-30 bg-black/5" />
      <section role="dialog" aria-modal="true" aria-labelledby="navigator-title" className="fixed bottom-[76px] left-4 z-40 max-h-[70vh] w-[min(510px,calc(100vw-32px))] overflow-y-auto rounded-[12px] border border-[#dedede] bg-white p-5 shadow-2xl sm:left-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="navigator-title" className="text-lg font-semibold text-[#111]">Question Bank</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close navigator" className="grid h-10 w-10 place-items-center rounded-md text-[#777] hover:bg-[#f1f1f1] hover:text-black"><CloseIcon className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 space-y-2.5 border-y border-[#e5e5e5] py-3 text-xs font-medium text-[#555]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold text-[#222]">Difficulty</span>
            <Legend color="bg-[#d9f7e5] ring-1 ring-[#9ee4bd]" label="Easy" />
            <Legend color="bg-[#fff2be] ring-1 ring-[#f0d978]" label="Medium" />
            <Legend color="bg-[#fee2e2] ring-1 ring-[#f5abab]" label="Hard" />
            <Legend color="bg-[#efe3ff] ring-1 ring-[#d6b8ff]" label="Challenge" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold text-[#222]">Status</span>
            <Legend color="bg-[#168448]" label="Correct" />
            <Legend color="bg-[#dc2626]" label="Incorrect" />
            <Legend color="bg-white ring-2 ring-[#d97706]" label="Correct after incorrect" />
            <Legend color="bg-[#ef8a13]" label="Saved" />
          </div>
        </div>
        <ol className="mt-5 grid grid-cols-[repeat(6,2.75rem)] justify-center gap-x-[7px] gap-y-3 sm:gap-x-5">
          {questions.map((question, index) => {
            const attempt = outcomes[question.id];
            const corrected = attempt?.correct === true && attempt.hadIncorrectAttempt;
            const isMarked = marked.has(question.id);
            const statusLabel = attempt ? (corrected ? ", answered correctly after an incorrect attempt" : attempt.correct ? ", answered correctly" : ", answered incorrectly") : "";
            const savedLabel = isMarked ? ", saved for review" : "";
            return (
              <li key={question.id} className="relative h-11 w-11 justify-self-center">
                {attempt && (
                  <span aria-hidden="true" className={`absolute -right-2 -top-2 z-10 grid h-[22px] w-[22px] place-items-center rounded-full shadow-sm ${corrected ? "border-[3px] border-[#d97706] bg-white text-[#d97706] ring-2 ring-white" : `border-[3px] border-white text-white ${attempt.correct ? "bg-[#168448]" : "bg-[#dc2626]"}`}`}>
                    {attempt.correct ? <CheckIcon className="h-3 w-3" /> : <CloseIcon className="h-3 w-3" />}
                  </span>
                )}
                {isMarked && <span aria-hidden="true" className="absolute -bottom-1.5 -right-1.5 z-10 grid h-[18px] w-[18px] place-items-center rounded-full border-[3px] border-white bg-[#ef8a13] text-white shadow-sm"><BookmarkIcon filled className="h-2.5 w-2.5" /></span>}
                <button
                  type="button"
                  onClick={() => onGoTo(index)}
                  aria-current={index === currentIndex ? "step" : undefined}
                  aria-label={`Question ${index + 1}, ${formatLevel(question.level)} difficulty${statusLabel}${savedLabel}`}
                  className={`grid h-11 w-11 cursor-pointer place-items-center rounded-[9px] text-sm font-semibold transition-[box-shadow,filter] duration-200 hover:brightness-95 ${levelTone(question.level)} ${index === currentIndex ? "ring-2 ring-black ring-offset-2" : ""}`}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function SessionSummary({ subject, total, answered, correct, marked, returnHref, onReview }: { subject: BankSubject; total: number; answered: number; correct: number; marked: number; returnHref?: string; onReview: () => void }) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const subjectLabel = subject === "math" ? "Math" : "Reading & Writing";
  const catalogHref = subject === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing";
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#f5f6f8] px-4 py-10 sm:px-7">
      <div className="mx-auto max-w-3xl rounded-[24px] border border-navy/10 bg-white p-6 text-center shadow-pop sm:p-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand/10 text-brand-600"><CheckIcon className="h-8 w-8" /></span>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Session complete</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.035em] text-navy">{subjectLabel} practice recap</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-navy/50">Every checked answer has been added to your Question Bank analytics.</p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryMetric value={`${answered}/${total}`} label="Checked" />
          <SummaryMetric value={String(correct)} label="Correct" />
          <SummaryMetric value={`${accuracy}%`} label="Accuracy" />
          <SummaryMetric value={String(marked)} label="For review" />
        </div>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={onReview} className="min-h-11 rounded-xl border border-navy/15 px-5 text-sm font-bold text-navy hover:border-brand/35 hover:text-brand-600">Review questions</button>
          <Link href={returnHref ?? catalogHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600">{returnHref ? "Back to my plan" : "Choose new topics"}</Link>
        </div>
      </div>
    </main>
  );
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-[#f5f7fa] px-3 py-4"><p className="font-display text-2xl font-extrabold text-navy">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.11em] text-navy/40">{label}</p></div>;
}

function EmptySession({ filters, subject }: { filters: MathSessionFilters; subject: BankSubject }) {
  const filtered = filters.skills.length > 0 || filters.difficulty !== "all" || filters.completion !== "all";
  const subjectLabel = subject === "math" ? "Math" : "Reading & Writing";
  const catalogHref = subject === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing";
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f6f8] px-4">
      <div className="max-w-lg rounded-[24px] border border-navy/10 bg-white p-8 text-center shadow-pop">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand-600"><FilterIcon className="h-7 w-7" /></span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-navy">No matching {subjectLabel} questions</h1>
        <p className="mt-2 text-sm leading-6 text-navy/50">{filtered ? "That combination of topics and filters has no available questions yet." : `The ${subjectLabel} bank is ready for content, but no questions are currently published.`}</p>
        <Link href={catalogHref} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600">Change filters</Link>
      </div>
    </main>
  );
}

function PausedOverlay({ onResume }: { onResume: () => void }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-navy/45 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="paused-title" className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/20 text-gold-600"><PauseIcon className="h-7 w-7" /></span><h2 id="paused-title" className="mt-4 font-display text-2xl font-extrabold text-navy">Practice paused</h2><p className="mt-2 text-sm text-navy/50">Your timer is stopped. Resume when you are ready.</p><button type="button" onClick={onResume} className="mt-6 min-h-11 rounded-xl bg-brand px-6 text-sm font-extrabold text-white hover:bg-brand-600">Resume practice</button></div></div>;
}

function DirectionsPanel({ subject, onClose }: { subject: BankSubject; onClose: () => void }) {
  const isMath = subject === "math";
  return <div className="fixed inset-0 z-50"><button type="button" aria-label="Close directions" onClick={onClose} className="absolute inset-0 bg-navy/30" /><section role="dialog" aria-modal="true" aria-labelledby="directions-title" className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"><div className="flex-1 overflow-y-auto p-7"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">1500 Blueprint</p><h2 id="directions-title" className="mt-1 font-display text-2xl font-extrabold text-navy">{isMath ? "Math" : "Reading & Writing"} directions</h2><div className="mt-5 space-y-4 text-sm leading-7 text-navy/65">{isMath ? <><p>Use the calculator and reference sheet whenever they help. You can move between questions at any time.</p><p>For multiple-choice questions, select one answer and check it. For student-produced responses, enter a decimal or fraction without symbols or units.</p></> : <><p>Read the passage in the left panel, then choose the answer that best responds to the question on the right.</p><p>Select one answer and check it. You can highlight text, eliminate choices, move between questions, and mark questions for review.</p></>}<p>Checked answers are saved to your Question Bank analytics. Mark any item you want to revisit before ending the session.</p></div></div><div className="border-t border-navy/10 p-5"><button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl bg-brand text-sm font-extrabold text-white hover:bg-brand-600">Return to practice</button></div></section></div>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readStoredAttempts(key: string): Record<string, QuestionBankAttemptState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Record<string, QuestionBankAttemptState>) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function initialAnswers(attempts: Record<string, QuestionBankAttemptState>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attempts).map(([questionId, attempt]) => [questionId, attempt.response]),
  );
}

function levelTone(level: QuestionBankLevel): string {
  const tones: Record<QuestionBankLevel, string> = {
    easy: "bg-[#d9f7e5] text-[#168448]",
    medium: "bg-[#fff2be] text-[#d87807]",
    hard: "bg-[#fee2e2] text-[#dc2626]",
    challenge: "bg-[#efe3ff] text-[#8b31e8]",
  };
  return tones[level];
}

function formatLevel(level: QuestionBankLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function createToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type IconProps = { className?: string };

function ArrowLeftIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ChevronDownIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ChevronUpIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 14 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PauseIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>; }
function PlayIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>; }
function CheckIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>; }
function HighlightIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 16 8.5-8.5 4 4L8 20H4v-4Z" strokeLinejoin="round" /><path d="m14.5 5.5 2-2 4 4-2 2M12 20h9" strokeLinecap="round" /></svg>; }
function CalculatorIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8v3H8zM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01" strokeLinecap="round" /></svg>; }
function ReferenceIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3Z" strokeLinejoin="round" /><path d="M14 3v4h4M9 12h6M9 16h6" strokeLinecap="round" /></svg>; }
function FilterIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" /></svg>; }
function BookmarkIcon({ className, filled }: IconProps & { filled: boolean }) { return <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3V4Z" strokeLinejoin="round" /></svg>; }
function EliminateIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 12a5 5 0 0 1 9-3M17 12a5 5 0 0 1-9 3M4 12h16" strokeLinecap="round" /><path d="m14 5 2 4-4 1M10 19l-2-4 4-1" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
