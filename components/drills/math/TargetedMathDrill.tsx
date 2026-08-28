"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import { DrillEmpty } from "../shared/DrillEmpty";
import { DigitalTimer, LivesHud } from "../shared/Hud";
import { chip, label, primaryBtn, secondaryBtn, surface } from "../shared/ui";
import { CalculatorIcon, CloseIcon, ReferenceIcon } from "@/components/test/icons";
import { MathText } from "@/components/test/MathText";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import { ReportQuestionButton } from "@/components/questions/ReportQuestionButton";
import { TrophyIcon, XCircleIcon } from "../shared/icons";
import { DirectionsPanel } from "./DirectionsPanel";
import {
  REFERENCE_FORMULAS,
  SECONDS_PER_QUESTION,
  START_LIVES,
  WIN_TARGET,
  isCorrect,
  questionsFor,
  type MathDifficulty,
  type MathQuestion,
} from "./mockData";

type Phase = "playing" | "win" | "fail";
type Overlay = null | "calculator" | "reference";
type PendingOutcome = { phase: Exclude<Phase, "playing">; correct: number; total: number };

export function TargetedMathDrill({
  difficulty = "medium",
  questions: provided,
  returnHref = "/drills",
}: {
  difficulty?: MathDifficulty;
  questions?: MathQuestion[];
  returnHref?: string;
}) {
  if (provided !== undefined && provided.length === 0) {
    return <DrillEmpty title="Targeted Math Practice" eyebrow="Math" returnHref={returnHref} />;
  }

  return (
    <TargetedMathSession
      difficulty={difficulty}
      questions={provided}
      returnHref={returnHref}
    />
  );
}

function TargetedMathSession({
  difficulty,
  questions: provided,
  returnHref,
}: {
  difficulty: MathDifficulty;
  questions?: MathQuestion[];
  returnHref: string;
}) {
  // Real DB questions when supplied; otherwise the offline mock for this difficulty.
  const questions = provided ?? questionsFor(difficulty);
  // Only DB-backed questions have real ids to record; the offline mock isn't tracked.
  const tracked = Boolean(provided?.length);

  const [phase, setPhase] = useState<Phase>("playing");
  const [qIndex, setQIndex] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [seconds, setSeconds] = useState(SECONDS_PER_QUESTION);
  const [answer, setAnswer] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<PendingOutcome | null>(null);
  const savingRef = useRef(false);
  const answerTokenRef = useRef(crypto.randomUUID());
  const sessionTokenRef = useRef(crypto.randomUUID());

  const question = questions[qIndex % questions.length];

  // Persist before advancing so a failed request cannot silently drop work.
  async function markSeen(questionId: string, submittedAnswer: string): Promise<boolean> {
    if (!tracked) return true;
    try {
      const response = await fetch("/api/drills/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drillSlug: "targeted-math",
          questionId,
          answer: submittedAnswer,
          clientToken: answerTokenRef.current,
          sessionToken: sessionTokenRef.current,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setSaveError(result?.error ?? "Your answer could not be saved. Retry to continue.");
        return false;
      }
      setSaveError(null);
      answerTokenRef.current = crypto.randomUUID();
      return true;
    } catch {
      setSaveError("Your answer could not be saved. Check your connection and retry.");
      return false;
    }
  }

  async function completeSession(): Promise<boolean> {
    if (!tracked) return true;
    try {
      const response = await fetch("/api/drills/targeted-math/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientToken: sessionTokenRef.current,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setSaveError(result?.error ?? "Your completed session could not be saved. Retry to continue.");
        return false;
      }
      setSaveError(null);
      return true;
    } catch {
      setSaveError("Your completed session could not be saved. Check your connection and retry.");
      return false;
    }
  }

  async function retryOutcome(outcome: PendingOutcome) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingAnswer(true);
    const saved = await completeSession();
    savingRef.current = false;
    setSavingAnswer(false);
    if (saved) {
      setPendingOutcome(null);
      setPhase(outcome.phase);
    }
  }

  function advance() {
    setQIndex((i) => i + 1);
    setSeconds(SECONDS_PER_QUESTION);
    setAnswer("");
  }

  async function loseLife() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingAnswer(true);
    const saved = await markSeen(question.id, "");
    savingRef.current = false;
    setSavingAnswer(false);
    if (!saved) return;
    const nextLives = lives - 1;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setLives(nextLives);
    if (nextLives <= 0) {
      const outcome: PendingOutcome = { phase: "fail", correct, total: nextAttempts };
      setPendingOutcome(outcome);
      await retryOutcome(outcome);
    } else {
      advance();
    }
  }

  async function submit() {
    if (pendingOutcome) {
      await retryOutcome(pendingOutcome);
      return;
    }
    if (!answer.trim() || savingRef.current) return;
    savingRef.current = true;
    setSavingAnswer(true);
    const saved = await markSeen(question.id, answer);
    savingRef.current = false;
    setSavingAnswer(false);
    if (!saved) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    const ok = isCorrect(answer, question.accepted);
    if (ok) {
      const next = correct + 1;
      setCorrect(next);
      if (next >= WIN_TARGET) {
        const outcome: PendingOutcome = { phase: "win", correct: next, total: nextAttempts };
        setPendingOutcome(outcome);
        await retryOutcome(outcome);
      } else {
        advance();
      }
    } else {
      const nextLives = lives - 1;
      setLives(nextLives);
      if (nextLives <= 0) {
        const outcome: PendingOutcome = { phase: "fail", correct, total: nextAttempts };
        setPendingOutcome(outcome);
        await retryOutcome(outcome);
      } else {
        advance();
      }
    }
  }

  // Per-question countdown. Running out of time costs a life. The transition is
  // triggered inside the interval callback (not the effect body) to stay pure.
  useEffect(() => {
    if (phase !== "playing" || pendingOutcome) return;
    const id = window.setInterval(() => {
      if (seconds <= 1) void loseLife();
      else setSeconds((s) => s - 1);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds, pendingOutcome]);

  function restart() {
    setPhase("playing");
    setQIndex(0);
    setLives(START_LIVES);
    setCorrect(0);
    setAttempts(0);
    setSeconds(SECONDS_PER_QUESTION);
    setAnswer("");
    setSaveError(null);
    setPendingOutcome(null);
    savingRef.current = false;
    setSavingAnswer(false);
    answerTokenRef.current = crypto.randomUUID();
    sessionTokenRef.current = crypto.randomUUID();
  }

  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 100;

  if (phase !== "playing") {
    return (
      <DrillShell title="Targeted Math Practice" eyebrow="Math" exitHref={returnHref}>
        <ResultScreen won={phase === "win"} correct={correct} accuracy={accuracy} onRetry={restart} returnHref={returnHref} />
      </DrillShell>
    );
  }

  const center = (
    <div className="flex items-center gap-2 sm:gap-3">
      <LivesHud total={START_LIVES} remaining={Math.max(0, lives)} />
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-navy">
        {correct} / {WIN_TARGET}
        <span className="ml-1 hidden font-normal text-navy/45 sm:inline">correct</span>
      </span>
      <DigitalTimer seconds={seconds} warning={seconds <= 10} />
    </div>
  );

  const right = (
    <div className="flex items-center gap-1.5">
      <ReportQuestionButton compact questionId={question.id} targetType="question-bank" />
      <ToolButton icon={<CalculatorIcon className="h-4 w-4" />} text="Calculator" onClick={() => setOverlay("calculator")} />
      <ToolButton icon={<ReferenceIcon className="h-4 w-4" />} text="Reference" onClick={() => setOverlay("reference")} />
    </div>
  );

  return (
    <DrillShell title="Targeted Math Practice" eyebrow="Math" exitHref={returnHref} center={center} right={right}>
      <div className={`mx-auto max-w-5xl ${surface} p-5 sm:p-7`}>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-0">
          <div className="lg:pr-8">
            <DirectionsPanel />
          </div>

          <div className="lg:border-l lg:border-navy/12 lg:pl-8">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-chip bg-navy text-sm font-bold text-white">
                {(qIndex % questions.length) + 1}
              </span>
              <span className={`${chip} bg-brand/10 text-brand-600`}>{difficulty}</span>
            </div>

            <p className="mt-4 font-serif text-[17px] leading-relaxed text-exam-ink">
              <MathText>{question.prompt}</MathText>
            </p>

            <label htmlFor="math-answer" className={`${label} mt-6 block text-navy/50`}>
              Enter your answer
            </label>
            <input
              id="math-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={savingAnswer || Boolean(pendingOutcome)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              inputMode="text"
              autoComplete="off"
              placeholder="Type your answer"
              className="mt-2 w-44 rounded-card border border-navy/25 bg-white px-3 py-2 text-center font-serif text-lg tabular-nums text-exam-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/20"
            />

            <div className="mt-4">
              <div className={`${label} text-navy/50`}>Answer preview</div>
              <div className="mt-1.5 min-h-[2.5rem] rounded-card border border-navy/15 bg-paper/50 px-3 py-2 font-serif text-base text-exam-ink">
                {answer.trim() ? answer : <span className="text-navy/35">No answer entered</span>}
              </div>
            </div>

            {saveError ? <p role="alert" className="mt-4 text-sm font-semibold text-danger-600">{saveError}</p> : null}
            <button type="button" onClick={() => void submit()} disabled={(!answer.trim() && !pendingOutcome) || savingAnswer} className={`${primaryBtn} mt-5 w-full sm:w-auto`}>
              {savingAnswer ? "Saving…" : pendingOutcome ? "Retry session save" : saveError ? "Retry answer" : "Submit answer"}
            </button>
          </div>
        </div>
      </div>

      {overlay === "reference" ? (
        <Modal title="Reference" onClose={() => setOverlay(null)}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REFERENCE_FORMULAS.map((f) => (
              <li key={f.label} className="rounded-card border border-navy/12 bg-paper/40 px-3 py-2">
                <div className="text-xs text-navy/50">{f.label}</div>
                <div className="mt-0.5 font-serif text-[15px] text-exam-ink">{f.formula}</div>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}

      {overlay === "calculator" ? <CalculatorPanel onClose={() => setOverlay(null)} /> : null}
    </DrillShell>
  );
}

function ToolButton({ icon, text, onClick }: { icon: ReactNode; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-card border border-navy/15 px-2.5 py-1.5 text-sm font-semibold text-navy/70 transition-colors hover:bg-navy/5 hover:text-navy"
    >
      {icon}
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/30 p-4" onClick={onClose}>
      <div className="animate-pop-in w-full max-w-lg rounded-card border border-navy/15 bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
          <h3 className={`${label} text-navy/60`}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-card p-1 text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ResultScreen({ won, correct, accuracy, onRetry, returnHref }: { won: boolean; correct: number; accuracy: number; onRetry: () => void; returnHref: string }) {
  return (
    <div className={`animate-pop-in mx-auto mt-8 max-w-md overflow-hidden rounded-card border ${won ? "border-success/30" : "border-danger/30"}`}>
      <div className={`border-l-[3px] px-6 py-6 ${won ? "border-l-success bg-success-bg" : "border-l-danger bg-danger-bg"}`}>
        <div className="flex items-center gap-3">
          <span className={won ? "text-success-600" : "text-danger-600"}>
            {won ? <TrophyIcon className="h-6 w-6" /> : <XCircleIcon className="h-6 w-6" />}
          </span>
          <div>
            <div className={`${label} ${won ? "text-success-600" : "text-danger-600"}`}>
              {won ? "Challenge complete" : "Out of lives"}
            </div>
            <h2 className="font-display text-xl font-bold text-ink">
              {won ? "You reached 10 correct" : "Run ended"}
            </h2>
          </div>
        </div>
      </div>
      <div className="bg-white px-6 py-5">
        <div className="flex gap-8">
          <Stat value={String(correct)} unit="correct" />
          <Stat value={`${accuracy}%`} unit="accuracy" />
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onRetry} className={primaryBtn}>
            Try again
          </button>
          <Link href={returnHref} className={secondaryBtn}>
            Back to drills
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-extrabold tabular-nums text-navy">{value}</div>
      <div className="text-xs text-navy/50">{unit}</div>
    </div>
  );
}
