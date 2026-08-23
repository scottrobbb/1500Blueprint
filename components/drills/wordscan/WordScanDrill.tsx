"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import { RingTimer, SegmentedProgress } from "../shared/Hud";
import { label, primaryBtn, secondaryBtn } from "../shared/ui";
import { CheckIcon } from "@/components/test/icons";
import { TrophyIcon } from "../shared/icons";
import { ChoiceCard } from "./WordScanChoice";
import {
  QUESTION_SECONDS,
  TOTAL_QUESTIONS,
  WORD_SCAN_MODES,
  firstWord,
  type WordScanChoice,
  type WordScanMode,
} from "./mock";

type ChoiceId = WordScanChoice["id"];
type Phase = "playing" | "result";
type Outcome = "failed" | "complete";

export function WordScanDrill({ mode = "ceased", returnHref = "/drills" }: { mode?: WordScanMode; returnHref?: string }) {
  const config = WORD_SCAN_MODES[mode];
  const questions = config.questions;
  const verbSet = config.verbs.map((v) => v.toLowerCase());

  const [phase, setPhase] = useState<Phase>("playing");
  const [qIndex, setQIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [flagged, setFlagged] = useState<ChoiceId[]>([]);
  const [seconds, setSeconds] = useState(QUESTION_SECONDS);
  const [outcome, setOutcome] = useState<Outcome>("failed");
  const [failedFlags, setFailedFlags] = useState<ChoiceId[]>([]);

  const question = questions[qIndex % questions.length];

  function evaluate(ids: ChoiceId[]) {
    const want = [...question.correct].sort().join(",");
    const got = [...ids].sort().join(",");
    if (want === got) {
      const next = completed + 1;
      setCompleted(next);
      if (next >= TOTAL_QUESTIONS) {
        setOutcome("complete");
        setPhase("result");
      } else {
        setQIndex((i) => i + 1);
        setFlagged([]);
        setSeconds(QUESTION_SECONDS);
      }
    } else {
      setFailedFlags(ids);
      setOutcome("failed");
      setPhase("result");
    }
  }

  // Fast per-question countdown. Time running out grades the current flags. The
  // transition runs inside the timeout callback (not the effect body).
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setTimeout(() => {
      const nextVal = Math.max(0, Number((seconds - 0.1).toFixed(1)));
      if (nextVal <= 0) evaluate(flagged);
      else setSeconds(nextVal);
    }, 100);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds, flagged]);

  function toggle(id: ChoiceId) {
    setFlagged((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function restart() {
    setPhase("playing");
    setQIndex(0);
    setCompleted(0);
    setFlagged([]);
    setSeconds(QUESTION_SECONDS);
    setFailedFlags([]);
  }

  if (phase === "result") {
    return (
      <DrillShell title="Word Scan Drill" eyebrow={config.name} exitHref={returnHref}>
        <ResultScreen
          outcome={outcome}
          questionNumber={completed + 1}
          completed={completed}
          choices={question.choices}
          correct={question.correct}
          flagged={failedFlags}
          verbSet={verbSet}
          onRetry={restart}
          returnHref={returnHref}
        />
      </DrillShell>
    );
  }

  const center = (
    <span className="text-sm font-semibold tabular-nums text-navy">
      {completed + 1} <span className="font-normal text-navy/45">/ {TOTAL_QUESTIONS}</span>
    </span>
  );

  return (
    <DrillShell title="Word Scan Drill" eyebrow={config.name} exitHref={returnHref} center={center}>
      <div className="mx-auto max-w-3xl">
        <SegmentedProgress total={TOTAL_QUESTIONS} current={completed} />

        <div className="mt-8 flex flex-col items-center text-center">
          <RingTimer seconds={seconds} total={QUESTION_SECONDS} />
          <p className="mt-4 max-w-xl text-sm text-navy/65">
            Tap choices that START with a{" "}
            <span className="font-semibold text-navy">{config.name}</span> verb
            <span className="text-navy/45"> ({config.verbs.join(", ")})</span>
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {question.choices.map((choice) => (
            <ChoiceCard
              key={choice.id}
              choice={choice}
              flagged={flagged.includes(choice.id)}
              disabled={false}
              onToggle={() => toggle(choice.id)}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => evaluate([])}
            className="inline-flex items-center gap-2 rounded-card border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy/70 transition-colors hover:bg-navy/5"
          >
            <NoEntryIcon className="h-4 w-4" />
            None
          </button>
          <button type="button" onClick={() => evaluate(flagged)} disabled={flagged.length === 0} className={primaryBtn}>
            <CheckIcon className="h-4 w-4" />
            Done
          </button>
        </div>
      </div>
    </DrillShell>
  );
}

function ResultScreen({
  outcome,
  questionNumber,
  completed,
  choices,
  correct,
  flagged,
  verbSet,
  onRetry,
  returnHref,
}: {
  outcome: Outcome;
  questionNumber: number;
  completed: number;
  choices: WordScanChoice[];
  correct: ChoiceId[];
  flagged: ChoiceId[];
  verbSet: string[];
  onRetry: () => void;
  returnHref: string;
}) {
  const complete = outcome === "complete";
  return (
    <div className="mx-auto max-w-3xl">
      <div className={`animate-pop-in overflow-hidden rounded-card border ${complete ? "border-success/30" : "border-danger/30"}`}>
        <div className={`border-l-[3px] px-6 py-6 ${complete ? "border-l-success bg-success-bg" : "border-l-danger bg-danger-bg"}`}>
          <div className="flex items-center gap-3">
            <span className={complete ? "text-success-600" : "text-danger-600"}>
              {complete ? <TrophyIcon className="h-6 w-6" /> : <NoEntryIcon className="h-6 w-6" />}
            </span>
            <div>
              <div className={`${label} ${complete ? "text-success-600" : "text-danger-600"}`}>
                {complete ? "Run complete" : `Failed on question ${questionNumber}`}
              </div>
              <h2 className="font-display text-xl font-bold text-ink">
                {completed}/{TOTAL_QUESTIONS} correct
              </h2>
            </div>
          </div>
        </div>
      </div>

      {!complete ? (
        <div className="mt-5">
          <h3 className={`${label} mb-3 text-navy/50`}>What you missed</h3>
          <div className="space-y-3">
            {choices.map((choice) => {
              const shouldFlag = correct.includes(choice.id);
              const didFlag = flagged.includes(choice.id);
              const missed = shouldFlag && !didFlag;
              const wrong = !shouldFlag && didFlag;
              const tone = missed
                ? "border-danger/40 bg-danger-bg"
                : wrong
                  ? "border-flag/40 bg-flag-bg"
                  : "border-navy/12 bg-white";
              return (
                <div key={choice.id} className={`rounded-card border px-4 py-3.5 ${tone}`}>
                  <p className="font-serif text-[15px] leading-relaxed text-exam-ink">
                    <span className="font-semibold">{choice.id}.</span>{" "}
                    {missed ? <FirstWordMark text={choice.text} verbSet={verbSet} /> : choice.text}
                  </p>
                  {missed ? (
                    <div className="mt-1.5 text-xs font-semibold text-danger-600">Should have been flagged</div>
                  ) : null}
                  {wrong ? <div className="mt-1.5 text-xs font-semibold text-flag">Incorrectly flagged</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onRetry} className={primaryBtn}>
          Try again
        </button>
        <Link href={returnHref} className={secondaryBtn}>
          Back to drills
        </Link>
      </div>
    </div>
  );
}

// Bolds + underlines the opening word when it is a target verb (the reason the
// choice should have been flagged).
function FirstWordMark({ text, verbSet }: { text: string; verbSet: string[] }) {
  const m = text.match(/^(\s*)([A-Za-z]+)([\s\S]*)$/);
  if (!m || !verbSet.includes(firstWord(text))) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="font-bold underline decoration-danger/60 underline-offset-2">{m[2]}</span>
      {m[3]}
    </>
  );
}

function NoEntryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
