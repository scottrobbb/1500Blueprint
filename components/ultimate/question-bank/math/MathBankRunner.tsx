"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import { MathText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import { ReferenceModal } from "@/components/test/ReferenceModal";
import { normalizeGridInInput } from "@/lib/sat/gridIn";
import { type MathAttemptResult, type MathRunnerQuestion } from "@/lib/question-bank/math";
import type { MathSessionFilters } from "@/lib/question-bank/math-queries";

type RunnerResult = MathAttemptResult & { response: string };
type ToolPanel = "calculator" | "reference" | "directions" | "more" | "note" | "report" | null;
type BankSubject = "math" | "reading-writing";
type BankRunnerQuestion = Omit<MathRunnerQuestion, "domain"> & { domain: string };
type BankRunnerProps = {
  questions: BankRunnerQuestion[];
  filters: MathSessionFilters;
};

export function MathBankRunner({
  questions,
  filters,
}: BankRunnerProps) {
  return <ObjectiveBankRunner questions={questions} filters={filters} subject="math" />;
}

export function ReadingWritingBankRunner({ questions, filters }: BankRunnerProps) {
  return <ObjectiveBankRunner questions={questions} filters={filters} subject="reading-writing" />;
}

function ObjectiveBankRunner({
  questions,
  filters,
  subject,
}: BankRunnerProps & { subject: BankSubject }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, RunnerResult>>({});
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [highlightOn, setHighlightOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [eliminatorOn, setEliminatorOn] = useState(false);
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const enteredQuestionAt = useRef(0);
  const sessionId = useRef<string | null>(null);
  const question = questions[currentIndex];
  const answer = question ? answers[question.id] ?? "" : "";
  const result = question ? results[question.id] : undefined;

  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    enteredQuestionAt.current = Date.now();
  }, [currentIndex]);

  function setAnswer(value: string) {
    if (!question || result) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  function toggleMarked() {
    if (!question) return;
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  }

  function goTo(index: number) {
    enteredQuestionAt.current = Date.now();
    setSubmitError(null);
    setCurrentIndex(Math.max(0, Math.min(index, questions.length - 1)));
    setNavigatorOpen(false);
    setFinished(false);
    setExplanationOpen(false);
  }

  function goNext() {
    if (currentIndex >= questions.length - 1) setFinished(true);
    else goTo(currentIndex + 1);
  }

  async function checkAnswer() {
    if (!question || !answer.trim() || result || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    sessionId.current ??= createToken();

    try {
      const response = await fetch(`/api/question-bank/${subject}/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          response: answer,
          durationMs: Date.now() - enteredQuestionAt.current,
          sessionId: sessionId.current,
          clientToken: createToken(),
        }),
      });
      const body = (await response.json()) as Partial<MathAttemptResult> & { error?: string };
      if (!response.ok || typeof body.correct !== "boolean") {
        throw new Error(body.error || "We could not check that answer.");
      }
      const correct = body.correct;
      setResults((current) => ({
        ...current,
        [question.id]: {
          correct,
          explanation: body.explanation ?? "A full solution is not available yet.",
          correctAnswer: body.correctAnswer ?? "",
          response: answer,
        },
      }));
      setExplanationOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We could not check that answer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (questions.length === 0) {
    return <EmptySession filters={filters} subject={subject} />;
  }

  const correctCount = Object.values(results).filter((item) => item.correct).length;
  const questionStrip = (
    <QuestionStrip
      index={currentIndex}
      marked={marked.has(question.id)}
      eliminatorOn={eliminatorOn}
      onToggleMarked={toggleMarked}
      onToggleEliminator={() => setEliminatorOn((value) => !value)}
      onOpenNote={() => setToolPanel((current) => current === "note" ? null : "note")}
      onOpenReport={() => setToolPanel((current) => current === "report" ? null : "report")}
    />
  );
  const answerArea = (
    <AnswerArea
      question={question}
      answer={answer}
      result={result}
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
        toolPanel={toolPanel}
        onTogglePause={() => setPaused((value) => !value)}
        onToggleTimer={() => setTimerHidden((value) => !value)}
        onToggleHighlight={() => setHighlightOn((value) => !value)}
        onOpenTool={(tool) => setToolPanel((current) => current === tool ? null : tool)}
      />

      {finished ? (
        <SessionSummary
          subject={subject}
          total={questions.length}
          answered={Object.keys(results).length}
          correct={correctCount}
          marked={marked.size}
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
                  {highlightOn && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#fff4bd] px-3 py-2 text-xs font-semibold text-[#555]">
                      <HighlightIcon className="h-4 w-4" /> Select text to highlight while you work.
                    </div>
                  )}
                  {question.passage && (
                    <QuestionContent text={question.passage} pClassName="font-serif text-[18px] leading-[1.65] text-[#111]" />
                  )}
                  {question.figureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={question.figureUrl} alt="Figure for this question" className="mt-6 max-h-[420px] max-w-full object-contain" />
                  )}
                </div>
              </section>
              <article className="px-4 py-6 sm:px-7 lg:px-6 lg:py-6 xl:px-10">
                <div className="mx-auto max-w-2xl">
                  {questionStrip}
                  <div className="px-1 py-5 sm:px-0">
                    <QuestionContent text={question.prompt} pClassName="font-serif text-[17px] leading-[1.55] text-[#111] sm:text-[18px]" />
                    {answerArea}
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <article className={`mx-auto w-full max-w-3xl px-4 py-8 selection:bg-[#ffe37a] sm:px-0 sm:py-11 ${highlightOn ? "cursor-text" : ""}`}>
              {questionStrip}
              <div className="px-1 py-5 sm:px-0">
                {highlightOn && (
                  <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#fff4bd] px-3 py-2 text-xs font-semibold text-[#555]">
                    <HighlightIcon className="h-4 w-4" /> Select text to highlight while you work.
                  </div>
                )}
                {question.passage && <QuestionContent text={question.passage} pClassName="mb-4 font-serif text-[17px] leading-7 text-[#111]" />}
                {question.figureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={question.figureUrl} alt="Figure for this question" className="mb-5 max-h-80 max-w-full object-contain" />
                )}
                <QuestionContent text={question.prompt} pClassName="font-serif text-[17px] leading-[1.55] text-[#111] sm:text-[18px]" />
                {answerArea}
              </div>
            </article>
          )}
        </main>
      )}

      <RunnerFooter
        subject={subject}
        currentIndex={currentIndex}
        total={questions.length}
        canGoPrevious={!finished && currentIndex > 0}
        nextLabel={currentIndex === questions.length - 1 ? "Finish" : "Next"}
        finished={finished}
        navigatorOpen={navigatorOpen}
        onPrevious={() => goTo(currentIndex - 1)}
        onNext={goNext}
        onToggleNavigator={() => setNavigatorOpen((value) => !value)}
        explanationAvailable={Boolean(result)}
        explanationOpen={explanationOpen}
        onOpenInfo={() => setToolPanel("directions")}
        onToggleExplanation={() => setExplanationOpen((value) => !value)}
      />

      {navigatorOpen && (
        <RunnerNavigator
          questions={questions}
          currentIndex={currentIndex}
          answers={answers}
          results={results}
          marked={marked}
          onGoTo={goTo}
          onClose={() => setNavigatorOpen(false)}
        />
      )}
      {paused && <PausedOverlay onResume={() => setPaused(false)} />}
      {toolPanel === "calculator" && <CalculatorPanel onClose={() => setToolPanel(null)} />}
      {toolPanel === "reference" && <ReferenceModal onClose={() => setToolPanel(null)} />}
      {toolPanel === "directions" && <DirectionsPanel subject={subject} onClose={() => setToolPanel(null)} />}
      {toolPanel === "note" && question && (
        <NotePanel
          value={notes[question.id] ?? ""}
          onChange={(value) => setNotes((current) => ({ ...current, [question.id]: value }))}
          onClose={() => setToolPanel(null)}
        />
      )}
      {toolPanel === "report" && <ReportPanel onClose={() => setToolPanel(null)} />}
      {toolPanel === "more" && (
        <MoreMenu
          subject={subject}
          timerHidden={timerHidden}
          onToggleTimer={() => setTimerHidden((value) => !value)}
          onClose={() => setToolPanel(null)}
        />
      )}
    </div>
  );
}

function RunnerHeader({
  subject,
  elapsedSeconds,
  timerHidden,
  paused,
  highlightOn,
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
            {timerHidden ? "—:—" : formatTime(elapsedSeconds)}
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
          <ToolButton label="Highlight" active={highlightOn} onClick={onToggleHighlight}><HighlightIcon className="h-5 w-5" /></ToolButton>
          {subject === "math" && <ToolButton label="Calculator" active={toolPanel === "calculator"} onClick={() => onOpenTool("calculator")}><CalculatorIcon className="h-5 w-5" /></ToolButton>}
          {subject === "math" && <ToolButton label="Reference" active={toolPanel === "reference"} onClick={() => onOpenTool("reference")}><ReferenceIcon className="h-5 w-5" /></ToolButton>}
          <ToolButton label="More" active={toolPanel === "more"} onClick={() => onOpenTool("more")}><MoreIcon className="h-5 w-5" /></ToolButton>
          <Link href="/ultimate/community" aria-label="Community" title="Community" className="hidden h-11 w-11 items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f5f5] hover:text-[#333] xl:inline-flex">
            <UsersIcon className="h-5 w-5" />
          </Link>
          <button type="button" onClick={onTogglePause} aria-label="Pause practice" title="Pause practice" className="hidden h-11 w-11 items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f5f5] hover:text-[#333] xl:inline-flex">
            <TimerIcon className="h-5 w-5" />
          </button>
        </nav>
      </div>
    </header>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label === "Calculator" ? "Open graphing calculator" : label} className={`inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg px-2 text-[9px] font-semibold transition-colors sm:min-w-[66px] sm:text-[10px] ${active ? "bg-white text-[#555] ring-2 ring-[#8d8d8d]" : "text-[#888] hover:bg-[#f5f5f5] hover:text-[#333]"}`}>
      {children}<span className="mt-0.5 hidden sm:block">{label}</span>
    </button>
  );
}

function QuestionStrip({ index, marked, eliminatorOn, onToggleMarked, onToggleEliminator, onOpenNote, onOpenReport }: { index: number; marked: boolean; eliminatorOn: boolean; onToggleMarked: () => void; onToggleEliminator: () => void; onOpenNote: () => void; onOpenReport: () => void }) {
  return (
    <div className="flex min-h-[52px] overflow-hidden rounded-[9px] bg-[#f3f3f3]">
      <span className="grid w-[52px] flex-none place-items-center bg-black text-xl font-semibold text-white">{index + 1}</span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onToggleMarked} aria-pressed={marked} className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm font-semibold sm:text-base ${marked ? "text-black" : "text-[#222] hover:text-black"}`}>
            <BookmarkIcon filled={marked} className="h-5 w-5 flex-none" />
            <span className="truncate">{marked ? "Marked for Review" : "Mark for Review"}</span>
          </button>
        </div>
        <div className="flex items-center gap-1 text-[#777]">
          <button type="button" onClick={onOpenNote} aria-label="Question notes" title="Question notes" className="hidden h-10 w-10 place-items-center rounded-md hover:bg-black/5 hover:text-black sm:grid"><NoteIcon className="h-5 w-5" /></button>
          <button type="button" onClick={onOpenReport} className="hidden min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-black/5 hover:text-black sm:inline-flex"><FlagIcon className="h-4 w-4" /> Report</button>
          <button type="button" onClick={onToggleEliminator} aria-pressed={eliminatorOn} aria-label="Toggle answer eliminator" title="Answer eliminator" className={`grid h-10 w-10 place-items-center rounded-[9px] ${eliminatorOn ? "bg-[#161616] text-white" : "bg-black text-white hover:bg-[#333]"}`}><EliminateIcon className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}

function AnswerArea({ question, answer, result, submitting, submitError, explanationOpen, eliminatorOn, eliminatedChoices, onAnswer, onCheck, onToggleExplanation, onToggleEliminated }: { question: BankRunnerQuestion; answer: string; result: RunnerResult | undefined; submitting: boolean; submitError: string | null; explanationOpen: boolean; eliminatorOn: boolean; eliminatedChoices: string[]; onAnswer: (value: string) => void; onCheck: () => void; onToggleExplanation: () => void; onToggleEliminated: (choiceId: string) => void }) {
  const isMultipleChoice = question.answerType === "mc_single";

  return (
    <div className="mt-6">
      {isMultipleChoice ? (
        <ul className="space-y-3.5">
          {question.choices.map((choice) => {
            const selected = answer === choice.id;
            const correctSelected = selected && result?.correct;
            const incorrectSelected = selected && result && !result.correct;
            const eliminated = eliminatedChoices.includes(choice.id);
            return (
              <li key={choice.id} className="flex items-center gap-3">
                <div className={`flex min-h-[54px] min-w-0 flex-1 items-center rounded-[10px] border px-1.5 transition-colors ${correctSelected ? "border-2 border-[#138a50] bg-[#e8f7ef]" : incorrectSelected ? "border-2 border-[#dc2626] bg-[#fee2e2]" : selected ? "border-2 border-[#139ee9] bg-white" : "border-[#2e2e2e] bg-white hover:bg-[#fafafa]"} ${eliminated ? "opacity-45" : ""}`}>
                  <button type="button" disabled={Boolean(result) || eliminated} onClick={() => onAnswer(choice.id)} aria-pressed={selected} className="flex min-h-[50px] min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-full border text-sm font-semibold ${correctSelected ? "border-[#138a50] bg-[#138a50] text-white" : incorrectSelected ? "border-[#dc2626] bg-[#dc2626] text-white" : selected ? "border-[#139ee9] bg-[#139ee9] text-white" : "border-[#2e2e2e] text-[#111]"}`}>
                      {incorrectSelected ? <CloseIcon className="h-4 w-4" /> : correctSelected ? <CheckIcon className="h-4 w-4" /> : choice.id}
                    </span>
                    <span className={`min-w-0 flex-1 font-serif text-[17px] leading-6 text-[#111] ${eliminated ? "line-through" : ""}`}><MathText>{choice.text}</MathText></span>
                  </button>
                  {selected && !result && (
                    <button type="button" onClick={() => void onCheck()} disabled={submitting} className="mr-1 rounded-lg bg-[#1aa8ef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1096d8] disabled:opacity-60">{submitting ? "Checking…" : "Check"}</button>
                  )}
                  {selected && result && (
                    <button type="button" onClick={onToggleExplanation} className="mr-1 rounded-lg bg-[#171717] px-4 py-2 text-sm font-semibold text-white hover:bg-black">Explain</button>
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
          <div className={`flex min-h-[54px] items-center rounded-[10px] border bg-white p-1.5 ${result?.correct ? "border-2 border-[#138a50] bg-[#e8f7ef]" : result && !result.correct ? "border-2 border-[#dc2626] bg-[#fee2e2]" : "border-[#333] focus-within:border-2 focus-within:border-[#139ee9]"}`}>
            <input
              id="math-response"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={answer}
              disabled={Boolean(result)}
              onChange={(event) => onAnswer(normalizeGridInInput(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onCheck();
              }}
              placeholder="Answer"
              className="min-w-0 flex-1 bg-transparent px-3 font-serif text-lg text-[#111] outline-none placeholder:text-[#aaa]"
            />
            {!result ? (
              <button type="button" disabled={!answer.trim() || submitting} onClick={() => void onCheck()} className="min-h-10 rounded-lg bg-[#1aa8ef] px-4 text-sm font-semibold text-white hover:bg-[#1096d8] disabled:cursor-not-allowed disabled:bg-[#d6dae1] disabled:text-[#929db0]">{submitting ? "Checking…" : "Check"}</button>
            ) : (
              <button type="button" onClick={onToggleExplanation} className="min-h-10 rounded-lg bg-[#171717] px-4 text-sm font-semibold text-white hover:bg-black">Explain</button>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#888]">Use a decimal or fraction. Do not enter commas, symbols, or units.</p>
        </div>
      )}

      {submitError && <p role="alert" className="mt-4 text-sm font-semibold text-[#dc2626]">{submitError}</p>}

      {result && explanationOpen && (
        <div className="mt-5 rounded-[10px] border border-[#d7d7d7] bg-[#fafafa] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-white ${result.correct ? "bg-[#138a50]" : "bg-[#dc2626]"}`}>{result.correct ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}</span>
              <h2 className="text-base font-semibold">{result.correct ? "Correct" : `Correct answer: ${result.correctAnswer}`}</h2>
            </div>
            <button type="button" onClick={onToggleExplanation} aria-label="Close explanation" className="grid h-9 w-9 place-items-center rounded-md text-[#777] hover:bg-[#eee] hover:text-black"><CloseIcon className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 border-t border-[#dedede] pt-4 font-serif text-[16px] leading-7 text-[#222]"><MathText>{result.explanation}</MathText></div>
        </div>
      )}
    </div>
  );
}

function RunnerFooter({ subject, currentIndex, total, canGoPrevious, nextLabel, finished, navigatorOpen, explanationAvailable, explanationOpen, onPrevious, onNext, onToggleNavigator, onOpenInfo, onToggleExplanation }: { subject: BankSubject; currentIndex: number; total: number; canGoPrevious: boolean; nextLabel: string; finished: boolean; navigatorOpen: boolean; explanationAvailable: boolean; explanationOpen: boolean; onPrevious: () => void; onNext: () => void; onToggleNavigator: () => void; onOpenInfo: () => void; onToggleExplanation: () => void }) {
  const catalogHref = subject === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing";
  const lessonsLabel = subject === "math" ? "Math lessons" : "Reading lessons";

  return (
    <footer className="relative z-20 border-t border-[#e8e8e8] bg-white px-3 py-3 sm:px-6">
      <div className="mx-auto grid max-w-[1170px] grid-cols-[auto_1fr_auto] items-center gap-3">
        <button type="button" onClick={onToggleNavigator} aria-expanded={navigatorOpen} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#171717] px-4 text-xs font-semibold text-white hover:bg-black sm:min-w-[150px] sm:justify-center sm:text-sm">
          {finished ? "Review" : `${currentIndex + 1} of ${total}`} <ChevronUpIcon className={`h-4 w-4 transition-transform ${navigatorOpen ? "rotate-180" : ""}`} />
        </button>
        <div className="hidden items-center justify-center gap-2 lg:flex">
          <button type="button" onClick={onOpenInfo} aria-label="Question information" title="Question information" className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#dedede] text-[#777] hover:bg-[#f5f5f5] hover:text-black"><InfoIcon className="h-5 w-5" /></button>
          <Link href="/ultimate/courses" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-600"><SparkIcon className="h-4 w-4" /> Math lessons</Link>
          <Link href="/ultimate/drills" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand/10 px-4 text-sm font-semibold text-brand-600 hover:bg-brand/15"><PlayCircleIcon className="h-4 w-4" /> {lessonsLabel}</Link>
          <Link href={catalogHref} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#ffedf5] px-4 text-sm font-semibold text-[#de367b] hover:bg-[#ffe2ef]"><RemixIcon className="h-4 w-4" /> Remix</Link>
          <button type="button" onClick={onToggleExplanation} disabled={!explanationAvailable} aria-pressed={explanationOpen} className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold ${explanationAvailable ? "bg-[#f2f2f2] text-[#555] hover:bg-[#e9e9e9]" : "cursor-not-allowed bg-[#f6f6f6] text-[#b9b9b9]"}`}><ListCheckIcon className="h-4 w-4" /> Explanation</button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrevious} disabled={!canGoPrevious} className="min-h-11 rounded-[10px] border border-[#d6d6d6] px-4 text-sm font-semibold text-[#555] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:text-[#c8c8c8] sm:px-6">Previous</button>
          {!finished && <button type="button" onClick={onNext} className="min-h-11 rounded-[10px] border border-[#d6d6d6] bg-white px-5 text-sm font-semibold text-[#555] hover:bg-[#f7f7f7] sm:px-7">{nextLabel}</button>}
        </div>
      </div>
    </footer>
  );
}

function RunnerNavigator({ questions, currentIndex, answers, results, marked, onGoTo, onClose }: { questions: BankRunnerQuestion[]; currentIndex: number; answers: Record<string, string>; results: Record<string, RunnerResult>; marked: Set<string>; onGoTo: (index: number) => void; onClose: () => void }) {
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
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-y border-[#e5e5e5] py-3 text-xs font-medium text-[#555]">
          <Legend color="bg-[#15945f]" label="Correct" />
          <Legend color="bg-[#dc2626]" label="Incorrect" />
          <Legend color="bg-[#f3c442]" label="Answered" />
          <Legend color="bg-[#ef8a13]" label="For review" />
        </div>
        <ol className="mt-5 grid grid-cols-6 gap-3">
          {questions.map((question, index) => {
            const result = results[question.id];
            const answered = Boolean(answers[question.id]?.trim());
            const isMarked = marked.has(question.id);
            const tone = result ? (result.correct ? "bg-[#d9f7e5] text-[#168448]" : "bg-[#fee2e2] text-[#dc2626]") : answered ? "bg-[#fff2be] text-[#d87807]" : "bg-white text-[#111]";
            return (
              <li key={question.id} className="relative">
                {isMarked && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#ef8a13]" />}
                <button type="button" onClick={() => onGoTo(index)} aria-current={index === currentIndex ? "step" : undefined} aria-label={`Question ${index + 1}${isMarked ? ", marked for review" : ""}`} className={`grid h-11 w-11 place-items-center rounded-[9px] text-sm font-semibold ${tone} ${index === currentIndex ? "ring-2 ring-black ring-offset-2" : ""}`}>{index + 1}</button>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function SessionSummary({ subject, total, answered, correct, marked, onReview }: { subject: BankSubject; total: number; answered: number; correct: number; marked: number; onReview: () => void }) {
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
          <Link href={catalogHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600">Choose new topics</Link>
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

function NotePanel({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close notes" onClick={onClose} className="fixed inset-0 z-30 bg-black/5" />
      <section role="dialog" aria-modal="true" aria-labelledby="note-title" className="fixed right-4 top-[84px] z-40 w-[min(360px,calc(100vw-32px))] rounded-[12px] border border-[#dedede] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="note-title" className="text-lg font-semibold">Question notes</h2>
          <button type="button" onClick={onClose} aria-label="Close notes" className="grid h-9 w-9 place-items-center rounded-md text-[#777] hover:bg-[#f2f2f2] hover:text-black"><CloseIcon className="h-4 w-4" /></button>
        </div>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write a note for this question…" className="mt-4 min-h-40 w-full resize-y rounded-[9px] border border-[#cfcfcf] p-3 text-sm leading-6 outline-none focus:border-[#777]" />
        <p className="mt-2 text-xs text-[#888]">Saved for this practice session.</p>
      </section>
    </>
  );
}

function ReportPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close report dialog" onClick={onClose} className="fixed inset-0 z-30 bg-black/10" />
      <section role="dialog" aria-modal="true" aria-labelledby="report-title" className="fixed left-1/2 top-1/2 z-40 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[#dedede] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="report-title" className="text-lg font-semibold">Report a question</h2><p className="mt-1 text-sm text-[#777]">Flag content that needs review before the full bank is published.</p></div>
          <button type="button" onClick={onClose} aria-label="Close report dialog" className="grid h-9 w-9 flex-none place-items-center rounded-md text-[#777] hover:bg-[#f2f2f2] hover:text-black"><CloseIcon className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid gap-2">
          {["Incorrect answer", "Unclear wording", "Broken figure or formatting"].map((reason) => <button key={reason} type="button" onClick={onClose} className="min-h-11 rounded-[9px] border border-[#d8d8d8] px-3 text-left text-sm font-medium hover:bg-[#f6f6f6]">{reason}</button>)}
        </div>
      </section>
    </>
  );
}

function MoreMenu({ subject, timerHidden, onToggleTimer, onClose }: { subject: BankSubject; timerHidden: boolean; onToggleTimer: () => void; onClose: () => void }) {
  const catalogHref = subject === "math" ? "/ultimate/bank/math" : "/ultimate/bank/reading-writing";
  return <><button type="button" aria-label="Close more menu" onClick={onClose} className="fixed inset-0 z-30" /><div className="fixed right-4 top-[116px] z-40 w-64 rounded-2xl border border-navy/10 bg-white p-2 shadow-2xl lg:top-[76px]"><button type="button" onClick={onToggleTimer} className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold text-navy hover:bg-navy/5"><span>{timerHidden ? "Show timer" : "Hide timer"}</span><TimerIcon className="h-5 w-5 text-navy/40" /></button><Link href={catalogHref} className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-bold text-navy hover:bg-navy/5"><span>End session</span><ArrowRightIcon className="h-4 w-4 text-navy/40" /></Link></div></>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type IconProps = { className?: string };

function ArrowLeftIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ArrowRightIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ChevronDownIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ChevronUpIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 14 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PauseIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>; }
function PlayIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>; }
function CheckIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>; }
function HighlightIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 16 8.5-8.5 4 4L8 20H4v-4Z" strokeLinejoin="round" /><path d="m14.5 5.5 2-2 4 4-2 2M12 20h9" strokeLinecap="round" /></svg>; }
function CalculatorIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8v3H8zM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01" strokeLinecap="round" /></svg>; }
function ReferenceIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3Z" strokeLinejoin="round" /><path d="M14 3v4h4M9 12h6M9 16h6" strokeLinecap="round" /></svg>; }
function MoreIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>; }
function TimerIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" strokeLinecap="round" /></svg>; }
function FilterIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" /></svg>; }
function BookmarkIcon({ className, filled }: IconProps & { filled: boolean }) { return <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3V4Z" strokeLinejoin="round" /></svg>; }
function NoteIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h5M15 16l3-3" strokeLinecap="round" /></svg>; }
function FlagIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M6 3.5a1 1 0 0 1 1-1h10.8a1 1 0 0 1 .78 1.63L16 7.35l2.58 3.22a1 1 0 0 1-.78 1.63H8V21H6V3.5Z" /></svg>; }
function EliminateIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 12a5 5 0 0 1 9-3M17 12a5 5 0 0 1-9 3M4 12h16" strokeLinecap="round" /><path d="m14 5 2 4-4 1M10 19l-2-4 4-1" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function UsersIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M3.5 19c.2-4 2.1-6 5.5-6s5.3 2 5.5 6h-11ZM14.5 19c0-2.2-.6-4-1.7-5.2 3.9-.9 6.9 1 7.2 5.2h-5.5Z" /></svg>; }
function InfoIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" strokeLinecap="round" /></svg>; }
function SparkIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M12 2 14 8l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" /></svg>; }
function PlayCircleIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none" /></svg>; }
function RemixIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h3c5 0 5 10 10 10h3M17 4l3 3-3 3M4 17h3c2 0 3-1.5 4-3M14 7c1-1 2-1 3-1h3M17 14l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ListCheckIcon({ className }: IconProps) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 7 2 2 3-4M11 7h9M4 16l2 2 3-4M11 16h9" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
