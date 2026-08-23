"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChoiceId } from "@/lib/sat/types";
import type { GrammarQuestion, ProcessFeedback } from "@/lib/drills/types";
import { grammarQuestion } from "@/lib/drills/mock";
import {
  GRAMMAR_MASTERY_MIN_SCORE,
  calculateGrammarMastery,
  type GrammarMasteryState,
} from "@/lib/drills/mastery";
import { DrillShell } from "../shared/DrillShell";
import { ExplainInput } from "../shared/ExplainInput";
import { GradingLoader } from "../shared/GradingLoader";
import { ScoreBanner } from "../shared/ScoreBanner";
import { CheckCircleIcon } from "../shared/icons";
import { GrammarQuestionView } from "./GrammarQuestion";
import { FlameIcon, ZapIcon } from "@/components/shell/icons";

type Phase = "question" | "grading" | "feedback";

// The grade endpoint returns the AI feedback plus the XP it awarded server-side.
type GradeResult = ProcessFeedback & {
  xpAwarded?: number;
  streak?: number;
  level?: number;
  xp?: number;
  grammarMastery?: GrammarMasteryState;
  saveStatus?: { mastery: boolean; question: boolean };
};

type GradeError = {
  code?: string;
};

type MasteryEvent = "progress" | "mastered" | "reset";

export function GrammarDrill({
  questions,
  streak: initialStreak = 0,
  initialMastery = calculateGrammarMastery([]),
  returnHref = "/drills",
}: {
  questions?: GrammarQuestion[];
  streak?: number;
  initialMastery?: GrammarMasteryState;
  returnHref?: string;
}) {
  // Real DB questions when provided, else the single mock so the UI still runs.
  const items = questions?.length ? questions : [grammarQuestion];

  const [phase, setPhase] = useState<Phase>("question");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<ChoiceId | null>(null);
  const [feedback, setFeedback] = useState<ProcessFeedback | null>(null);
  const [xpAwarded, setXpAwarded] = useState(0);
  const [streak, setStreak] = useState(initialStreak);
  const [masteryStreak, setMasteryStreak] = useState(initialMastery.streak);
  const [mastered, setMastered] = useState(initialMastery.mastered);
  const [masteryEvent, setMasteryEvent] = useState<MasteryEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const toastTimer = useRef<number | undefined>(undefined);
  const streakTarget = initialMastery.streakTarget;

  const q = items[index];
  const perfect = (feedback?.stepsMissed.length ?? 0) === 0;
  const xpLabel = `+${xpAwarded} XP`;

  // Grade the typed explanation against the real DB content + Scott's prompt,
  // then reveal feedback and pop the XP toast.
  async function submit(text: string) {
    setError(null);
    setSaveWarning(null);
    setPhase("grading");
    try {
      const res = await fetch("/api/drills/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drillSlug: "grammar",
          questionId: q.id,
          studentText: text,
          selectedChoice: selected ?? undefined,
        }),
      });
      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as GradeError;
        if (failure.code === "monthly_ai_limit") {
          setError(
            "You've reached your 500 AI submissions for this month. Your limit resets on the first of next month.",
          );
          setPhase("question");
          return;
        }
        throw new Error(`Grading failed (${res.status})`);
      }
      const data = (await res.json()) as GradeResult;
      setFeedback(data);
      setXpAwarded(data.xpAwarded ?? 0);
      if (typeof data.streak === "number") setStreak(data.streak);

      // The server rebuilds this state from the persisted attempt ledger, so
      // navigating away and back cannot reset the counter.
      if (data.grammarMastery) {
        const nextMastery = data.grammarMastery;
        if (nextMastery.mastered > mastered) {
          setMasteryEvent("mastered");
        } else if (nextMastery.streak > 0) {
          setMasteryEvent("progress");
        } else {
          setMasteryEvent("reset");
        }
        setMastered(nextMastery.mastered);
        setMasteryStreak(nextMastery.streak);
      }

      if (data.saveStatus?.mastery === false) {
        setSaveWarning(
          "Your answer was graded, but mastery could not be saved. Please try this question again before leaving.",
        );
      } else if (data.saveStatus?.question === false) {
        setSaveWarning(
          "Your mastery was saved, but your place in the question queue was not. Please try again in a moment.",
        );
      }

      setPhase("feedback");
      setShowToast(true);
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setShowToast(false), 3200);
    } catch {
      setError("We could not grade that just now. Please try again.");
      setPhase("question");
    }
  }

  function nextQuestion() {
    window.clearTimeout(toastTimer.current);
    setShowToast(false);
    setFeedback(null);
    setError(null);
    setSaveWarning(null);
    setSelected(null);
    setMasteryEvent(null);
    setPhase("question");
    setIndex((i) => (i + 1) % items.length);
  }

  // Clear the pending toast timer on unmount.
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const right = (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-flag">
        <FlameIcon className="h-4 w-4" />
        {streak}
      </span>
      <span className="hidden text-sm text-navy/70 sm:inline">
        {mastered}/{initialMastery.total} mastered
      </span>
    </div>
  );

  return (
    <DrillShell title="Grammar Drill" eyebrow="Reading & Writing" exitHref={returnHref} right={right}>
      {phase === "question" ? (
        <div className="mx-auto max-w-[760px]">
          <GrammarQuestionView question={q} selected={selected} onSelect={setSelected} />

          <div className="mt-3.5 flex items-center justify-between rounded-xl border border-navy/15 bg-white px-[18px] py-3">
            <span className="inline-flex items-center gap-[11px] text-sm font-semibold text-navy/70">
              Mastery streak
              <span className="inline-flex gap-1.5">
                {Array.from({ length: streakTarget }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[11px] w-[11px] rounded-full ${
                      i < masteryStreak ? "bg-brand" : "border-[1.5px] border-navy/25"
                    }`}
                  />
                ))}
              </span>
              <span className="text-navy/40">
                {masteryStreak}/{streakTarget}
              </span>
            </span>
            <span className="hidden text-xs text-navy/45 sm:inline">
              Score {GRAMMAR_MASTERY_MIN_SCORE} or higher twice in a row to master a pattern
            </span>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-3.5 rounded-[10px] border border-danger/30 border-l-[3px] border-l-danger bg-danger-bg px-4 py-3 text-[13px] font-semibold text-danger-600"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-3.5">
            <ExplainInput onSubmit={submit} />
          </div>
        </div>
      ) : null}

      {phase === "grading" ? <GradingLoader /> : null}

      {phase === "feedback" && feedback ? (
        <div className="stagger mx-auto max-w-[680px] space-y-3.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_200px]">
            <ScoreBanner score={feedback.score} verdict={feedback.verdict} />
            <XpCard xp={xpAwarded} score={feedback.score} />
          </div>

          <StreakNote event={masteryEvent} streak={masteryStreak} target={streakTarget} />
          {saveWarning ? (
            <div
              role="alert"
              className="rounded-[10px] border border-danger/30 border-l-[3px] border-l-danger bg-danger-bg px-4 py-3 text-[13px] font-semibold text-danger-600"
            >
              {saveWarning}
            </div>
          ) : null}
          <AiFeedbackCard text={feedback.feedback} />
          <StepsBox perfect={perfect} steps={feedback.stepsMissed} />
          <CorrectAnswerCard q={q} />

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={nextQuestion}
              className="rounded-lg bg-brand px-[22px] py-3 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px"
            >
              Next question →
            </button>
            <Link
              href={returnHref}
              className="rounded-lg border border-navy/20 bg-white px-[22px] py-3 text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
            >
              Back to drills
            </Link>
          </div>
        </div>
      ) : null}

      {showToast ? (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 animate-toast-in items-center gap-[11px] rounded-full bg-navy px-5 py-3 text-white shadow-[0_10px_30px_rgba(7,25,59,0.35)]">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold text-navy">
            <ZapIcon className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-extrabold text-gold">{xpLabel}</span>
          <span className="text-sm text-white/85">
            {masteryEvent === "mastered"
              ? "Pattern mastered, nice."
              : masteryEvent === "progress"
                ? "Keep the streak going."
                : "Streak reset, try the next one."}
          </span>
        </div>
      ) : null}
    </DrillShell>
  );
}

function XpCard({ xp, score }: { xp: number; score: number }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0b2a5b,#1b46a8)] p-[18px] text-center text-white">
      <div className="pointer-events-none absolute inset-0 w-[50px] animate-sheen bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]" />
      <div className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-sky">XP Earned</div>
      <div className="relative font-display text-[34px] font-black leading-[1.1] text-gold">+{xp} XP</div>
      <div className="relative text-xs text-white/70">graded {score}/100</div>
    </div>
  );
}

function StreakNote({
  event,
  streak,
  target,
}: {
  event: MasteryEvent | null;
  streak: number;
  target: number;
}) {
  if (!event) return null;
  const positive = event !== "reset";
  return (
    <div
      className={`flex items-center gap-[11px] rounded-[10px] border border-l-[3px] px-4 py-3.5 ${
        positive
          ? "border-success/30 border-l-success bg-success-bg text-success-600"
          : "border-danger/30 border-l-danger bg-danger-bg text-danger-600"
      }`}
    >
      {positive ? (
        <CheckIcon className="h-[18px] w-[18px] flex-none" />
      ) : (
        <RefreshIcon className="h-[18px] w-[18px] flex-none" />
      )}
      <span className="text-[13.5px] font-semibold leading-snug">
        {event === "mastered"
          ? `Mastery streak ${target}/${target}. Pattern mastered!`
          : event === "progress"
            ? `Nice, ${streak}/${target} toward mastering this pattern. One more ${GRAMMAR_MASTERY_MIN_SCORE}+ to lock it in.`
            : `Scored below ${GRAMMAR_MASTERY_MIN_SCORE}, so your mastery streak reset to 0/${target}. Keep going.`}
      </span>
    </div>
  );
}

function AiFeedbackCard({ text }: { text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-navy/15 bg-white">
      <div className="border-b border-navy/10 px-[18px] py-[11px] text-[11px] font-bold uppercase tracking-[0.14em] text-navy/50">
        AI Feedback
      </div>
      <p className="px-[18px] py-4 text-sm leading-[1.65] text-navy/[0.78]">{text}</p>
    </div>
  );
}

function StepsBox({ perfect, steps }: { perfect: boolean; steps: string[] }) {
  return (
    <div className={`overflow-hidden rounded-xl border ${perfect ? "border-success/30" : "border-danger/30"}`}>
      <div
        className={`border-l-[3px] px-[18px] py-[15px] ${
          perfect ? "border-l-success bg-success-bg" : "border-l-danger bg-danger-bg"
        }`}
      >
        <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${perfect ? "text-success-600" : "text-danger-600"}`}>
          {perfect ? "Steps you nailed" : "Steps you missed"}
        </div>
        {perfect ? (
          <p className="mt-2.5 inline-flex items-center gap-2 text-sm text-success-600">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            You covered every step of the critical path.
          </p>
        ) : (
          <ol className="mt-2.5 flex flex-col gap-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-[11px] text-sm leading-snug text-danger-600">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[5px] border border-danger/40 font-display text-[11px] font-bold tabular-nums">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function CorrectAnswerCard({ q }: { q: GrammarQuestion }) {
  const correctText = q.choices.find((c) => c.id === q.correct)?.text ?? "";
  return (
    <div className="overflow-hidden rounded-xl border border-navy/15 bg-white">
      <div className="border-b border-navy/10 px-[18px] py-[11px] text-[11px] font-bold uppercase tracking-[0.14em] text-navy/50">
        Correct answer
      </div>
      <div className="px-[18px] py-4">
        <p className="font-serif text-[14.5px] leading-[1.6] text-exam-ink">
          Best completion: <strong className="text-success-600">{correctText}</strong>
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-navy/60">
          <strong className="text-navy">
            {q.correct} · {correctText}.
          </strong>{" "}
          {q.explanation}
        </p>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-.6 4M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
