"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DrillShell } from "../shared/DrillShell";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import { MathText } from "@/components/test/MathText";
import { formatReadingTime, TOPICS } from "@/lib/dense-reading/method";
import { canNavigate } from "@/lib/dense-reading/state";
import type { ReadingHistory, ReadingSession } from "@/lib/dense-reading/types";
import { GuidedSteps } from "./GuidedSteps";
import { ReadingPassage } from "./ReadingPassage";
import { ReadingResults } from "./ReadingResults";
import {
  useReadingSession,
  type ReadingPersistence,
} from "./useReadingSession";
import { ReadingButton, ReadingDialog, surface } from "./ui";

export function DenseReadingRunner({
  initialSession,
  history,
  persist,
}: {
  initialSession: ReadingSession;
  history: ReadingHistory[];
  persist?: ReadingPersistence;
}) {
  const router = useRouter();
  const { session, state, dispatch, save, saving, error, conflict, ready } =
    useReadingSession(initialSession, persist);
  const [tools, setTools] = useState(false);
  const [directions, setDirections] = useState(false);
  const [navigator, setNavigator] = useState(false);
  const [calculator, setCalculator] = useState(false);
  const [highlighter, setHighlighter] = useState(true);
  const [hideTimer, setHideTimer] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [exiting, setExiting] = useState(false);
  const guided = session.mode === "guided";
  const p = state.progress[state.current];
  const question = session.questions[state.current];
  const answered = state.progress.filter((progress) => progress.answer).length;
  const navigable = canNavigate(state, session.mode) && ready && !saving;
  const showChoices =
    !guided ||
    ["flags", "order", "confidence", "select", "done"].includes(p.step) ||
    (p.step === "preview" && p.previewMs < 5000);
  async function exit() {
    if (exiting) return;
    setExiting(true);
    if (await save()) router.push("/drills/dense-reading");
    else setExiting(false);
  }
  if (session.status === "completed")
    return <ReadingResults session={session} history={history} />;
  return (
    <DrillShell
      title="Dense Reading"
      onExit={() => void exit()}
      exitLabel={exiting ? "Saving…" : "Save & exit"}
      center={
        <span className="text-sm font-semibold tabular-nums text-navy">
          {hideTimer ? "Dense Reading" : formatReadingTime(state.elapsedMs)}
        </span>
      }
      right={
        <ReadingButton
          secondary
          onClick={() => setTools(true)}
          className="px-3"
        >
          Tools
        </ReadingButton>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-navy">
            {state.review
              ? "Check your work"
              : `Question ${state.current + 1} of ${session.questions.length}`}
          </h1>
          <p className="mt-1 text-xs text-navy/60">
            {guided ? "Guided practice" : "Regular practice"} · {answered}{" "}
            answered
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-navy/60" role="status">
            {!ready
              ? "Restoring…"
              : saving
                ? "Saving…"
                : error
                  ? "Save needs attention"
                  : "Autosave on"}
          </span>
          <ReadingButton secondary onClick={() => setDirections(true)}>
            Directions
          </ReadingButton>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger-600"
        >
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            {conflict ? (
              <ReadingButton secondary onClick={() => window.location.reload()}>
                Reload latest save
              </ReadingButton>
            ) : (
              <ReadingButton
                secondary
                disabled={saving}
                onClick={() => void save()}
              >
                Retry save
              </ReadingButton>
            )}
          </div>
        </div>
      ) : null}
      <div
        inert={!ready || conflict || exiting}
        aria-busy={!ready || saving}
        className={!ready || conflict ? "pointer-events-none opacity-60" : ""}
      >
        {state.review ? (
          <section className={`${surface} p-5 sm:p-7`}>
            <h2 className="font-display text-xl font-semibold text-navy">
              Ready to finish?
            </h2>
            <p className="mt-2 text-sm leading-6 text-navy/65">
              {session.questions.length - answered
                ? `${session.questions.length - answered} question${session.questions.length - answered === 1 ? " is" : "s are"} unanswered. You can return before submitting.`
                : "Every question has an answer. Submit this round to see your results and explanations."}
              {guided
                ? " Submitted guided answers stay locked."
                : " You can change answers until the round is submitted."}
            </p>
            <div className="my-6 grid grid-cols-4 gap-3 sm:grid-cols-6">
              {session.questions.map((q, i) => (
                <ReadingButton
                  key={q.id}
                  secondary
                  onClick={() => dispatch({ type: "goto", index: i })}
                  aria-label={`Question ${i + 1}, ${state.progress[i].answer ? "answered" : "unanswered"}${state.progress[i].marked ? ", marked for review" : ""}`}
                  className="flex-col px-2"
                >
                  <span>
                    {i + 1} {state.progress[i].marked ? "⚑" : ""}
                  </span>
                  <span className="text-[11px] font-normal">
                    {state.progress[i].answer ? "Answered" : "Unanswered"}
                  </span>
                </ReadingButton>
              ))}
            </div>
            <ReadingButton
              disabled={saving || !ready}
              onClick={() => setConfirmSubmit(true)}
            >
              Submit round
            </ReadingButton>
          </section>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <ReadingPassage
              question={question}
              progress={p}
              guided={guided}
              highlighter={highlighter}
              dispatch={dispatch}
            />
            <div className="min-w-0 space-y-5">
              {guided ? (
                <GuidedSteps
                  question={question}
                  progress={p}
                  dispatch={dispatch}
                />
              ) : null}
              <section className={`${surface} p-5 sm:p-6`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-navy/60">
                    {TOPICS[question.topic].title}
                  </span>
                  <button
                    onClick={() => dispatch({ type: "mark" })}
                    aria-pressed={p.marked}
                    className="min-h-11 rounded-lg border border-navy/15 px-3 text-xs font-semibold text-navy"
                  >
                    {p.marked ? "Marked for review" : "Mark for review"}
                  </button>
                </div>
                <h2 className="font-serif text-lg leading-8 text-exam-ink">
                  <MathText>{question.prompt}</MathText>
                </h2>
                {showChoices ? (
                  <div className="mt-5 space-y-3">
                    {question.choices.map((c) => (
                      <div key={c.id} className="flex items-stretch gap-2">
                        <button
                          disabled={guided && p.step !== "select"}
                          onClick={() =>
                            dispatch({ type: "answer", choice: c.id })
                          }
                          aria-pressed={p.answer === c.id}
                          className={`min-h-11 min-w-0 flex-1 rounded-lg border p-3 text-left disabled:cursor-default ${p.answer === c.id ? "border-brand bg-ice" : "border-navy/20 bg-white"} ${p.eliminated.includes(c.id) ? "opacity-55 line-through" : ""}`}
                        >
                          <span className="mr-2 font-sans text-sm font-semibold text-navy">
                            {c.id}.
                          </span>
                          <span className="font-serif text-base leading-7 text-exam-ink">
                            <MathText>{c.text}</MathText>
                          </span>
                        </button>
                        {!guided && state.crossOut ? (
                          <button
                            aria-label={`${p.eliminated.includes(c.id) ? "Restore" : "Cross out"} choice ${c.id}`}
                            onClick={() =>
                              dispatch({ type: "eliminate", choice: c.id })
                            }
                            className="min-h-11 min-w-11 rounded-lg border border-navy/20 text-navy"
                          >
                            {p.eliminated.includes(c.id) ? "↶" : "×"}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg bg-haze p-3 text-sm text-navy/60">
                    {p.step === "choice"
                      ? "Read the current choice in the guided step above."
                      : "The choices will appear after you make your prediction."}
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
      {canNavigate(state, session.mode) ? (
        <footer className="sticky bottom-0 z-20 mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy/15 bg-white p-3 shadow-sm">
          <ReadingButton
            secondary
            disabled={!navigable || state.current === 0}
            onClick={() => dispatch({ type: "goto", index: state.current - 1 })}
          >
            Back
          </ReadingButton>
          <ReadingButton
            secondary
            disabled={!navigable}
            onClick={() => setNavigator(true)}
          >
            Questions · {answered}/{session.questions.length}
          </ReadingButton>
          <ReadingButton
            disabled={!navigable}
            onClick={() =>
              state.review
                ? setConfirmSubmit(true)
                : guided
                  ? dispatch({ type: "review" })
                  : dispatch({ type: "next" })
            }
          >
            {state.review
              ? "Finish"
              : guided
                ? "Review round"
                : state.current + 1 === session.questions.length
                  ? "Review round"
                  : "Next"}
          </ReadingButton>
        </footer>
      ) : null}
      {tools ? (
        <ReadingDialog title="Reading tools" onClose={() => setTools(false)}>
          <div className="grid gap-3">
            <ReadingButton
              secondary
              aria-pressed={highlighter}
              onClick={() => setHighlighter(!highlighter)}
            >
              Highlighting {highlighter ? "on" : "off"}
            </ReadingButton>
            <ReadingButton
              secondary
              aria-pressed={state.crossOut}
              onClick={() => dispatch({ type: "crossout" })}
            >
              Cross-out mode {state.crossOut ? "on" : "off"}
            </ReadingButton>
            <ReadingButton secondary onClick={() => setHideTimer(!hideTimer)}>
              {hideTimer ? "Show timer" : "Hide timer"}
            </ReadingButton>
            <ReadingButton
              secondary
              onClick={() => {
                setCalculator(true);
                setTools(false);
              }}
            >
              Open calculator
            </ReadingButton>
          </div>
        </ReadingDialog>
      ) : null}
      {directions ? (
        <ReadingDialog
          title="Dense Reading directions"
          onClose={() => setDirections(false)}
        >
          <div className="space-y-3 text-sm leading-7 text-navy/70">
            <p>
              Read the passage and choose the answer best supported by the text.
              Your round contains {session.questions.length} questions from
              Blueprint’s published reading bank.
            </p>
            <p>
              {guided
                ? "Guided practice starts with a five-second preview. Choose a confidence round, read the passage in five-word groups, write a prediction, and check choices word by word. Rounds 2 and 3 add keyword flag scanning. You can revisit skipped questions, but submitted answers are locked."
                : "Regular practice lets you move freely between questions and revise answers before submitting the round."}
            </p>
            <p>
              Use highlighting to select passage text and add notes. During
              segmented reading, use Highlight this segment. Mark questions you
              want to revisit. Save & exit pauses your round.
            </p>
            <p>
              The timer counts active practice time while this tab is visible.
              Your final report includes explanations and, in guided mode, time
              spent at each reading step.
            </p>
          </div>
        </ReadingDialog>
      ) : null}
      {navigator ? (
        <ReadingDialog
          title="Question navigator"
          onClose={() => setNavigator(false)}
        >
          <div className="grid grid-cols-4 gap-2">
            {session.questions.map((q, i) => (
              <ReadingButton
                secondary
                key={q.id}
                onClick={() => {
                  dispatch({ type: "goto", index: i });
                  setNavigator(false);
                }}
                aria-label={`Go to question ${i + 1}`}
              >
                {i + 1}
                {state.progress[i].answer ? " ✓" : ""}
                {state.progress[i].marked ? " ⚑" : ""}
              </ReadingButton>
            ))}
          </div>
          <ReadingButton
            className="mt-5"
            onClick={() => {
              dispatch({ type: "review" });
              setNavigator(false);
            }}
          >
            Go to review
          </ReadingButton>
        </ReadingDialog>
      ) : null}
      {confirmSubmit ? (
        <ReadingDialog
          title="Submit this round?"
          onClose={() => {
            if (!saving) setConfirmSubmit(false);
          }}
        >
          <p className="mb-5 text-sm leading-6 text-navy/70">
            {answered < session.questions.length
              ? `${session.questions.length - answered} unanswered question${session.questions.length - answered === 1 ? "" : "s"} will count as incorrect. `
              : "All questions are answered. "}
            Your answers will be final, and your results will be saved.
          </p>
          <ReadingButton
            disabled={saving}
            onClick={async () => {
              if (await save(true)) setConfirmSubmit(false);
            }}
          >
            {saving ? "Saving results…" : "Submit and view results"}
          </ReadingButton>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger-600">
              {error}
            </p>
          ) : null}
        </ReadingDialog>
      ) : null}
      {calculator ? (
        <CalculatorPanel onClose={() => setCalculator(false)} />
      ) : null}
    </DrillShell>
  );
}
