"use client";

import { useState } from "react";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import { chip, label, primaryBtn, secondaryBtn, surface } from "../shared/ui";
import { CheckCircleIcon, SparkIcon, XCircleIcon } from "../shared/icons";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import { CalculatorIcon } from "@/components/test/icons";
import {
  AI_MATH_QUESTIONS,
  gridCorrect,
  type AiMathChoice,
  type AiMathQuestion,
} from "./mock";

type ChoiceId = AiMathChoice["id"];

export function AiMathDrill({ returnHref = "/drills" }: { returnHref?: string }) {
  const questions = AI_MATH_QUESTIONS;

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<ChoiceId | null>(null);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const q = questions[index];
  const isCorrect = q.kind === "mc" ? selected === q.correct : gridCorrect(answer, q.accepted);
  const canCheck = q.kind === "mc" ? selected !== null : answer.trim().length > 0;
  const accuracy = index > 0 || revealed ? Math.round((correctCount / (index + (revealed ? 1 : 0) || 1)) * 100) : 0;

  function check() {
    if (!canCheck) return;
    setRevealed(true);
    if (isCorrect) setCorrectCount((c) => c + 1);
  }

  function next() {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setAnswer("");
    setRevealed(false);
  }

  function restart() {
    setIndex(0);
    setSelected(null);
    setAnswer("");
    setRevealed(false);
    setCorrectCount(0);
    setDone(false);
  }

  if (done) {
    const finalAcc = Math.round((correctCount / questions.length) * 100);
    return (
      <DrillShell title="AI Math Practice" eyebrow="Math" exitHref={returnHref}>
        <div className={`animate-pop-in mx-auto mt-8 max-w-md ${surface} px-6 py-7 text-center`}>
          <div className={`${label} text-brand-600`}>Session complete</div>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">
            {correctCount} / {questions.length} correct
          </h2>
          <p className="mt-1 text-sm text-navy/55">{finalAcc}% accuracy</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={restart} className={primaryBtn}>
              Practice again
            </button>
            <Link href={returnHref} className={secondaryBtn}>
              Back to drills
            </Link>
          </div>
        </div>
      </DrillShell>
    );
  }

  const center = (
    <span className="text-sm font-semibold tabular-nums text-navy">
      {index + 1} <span className="font-normal text-navy/45">/ {questions.length}</span>
    </span>
  );

  const right = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-navy/55 sm:inline">
        <span className="font-semibold tabular-nums text-navy">{accuracy}%</span> accuracy
      </span>
      <button
        type="button"
        onClick={() => setCalcOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-card border border-navy/15 px-2.5 py-1.5 text-sm font-semibold text-navy/70 transition-colors hover:bg-navy/5 hover:text-navy"
      >
        <CalculatorIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Calculator</span>
      </button>
    </div>
  );

  return (
    <DrillShell title="AI Math Practice" eyebrow="Math" exitHref={returnHref} center={center} right={right}>
      <div className={`mx-auto max-w-2xl ${surface} p-5 sm:p-7`}>
        <div className="flex items-center gap-2">
          <span className={`${chip} bg-brand/10 text-brand-600`}>
            <SparkIcon className="h-3 w-3" />
            AI-generated
          </span>
          <span className={`${chip} bg-navy/8 text-navy/60`}>Beta</span>
        </div>

        <p className="mt-4 font-serif text-[17px] leading-relaxed text-exam-ink">{q.prompt}</p>

        {q.kind === "mc" ? (
          <Choices question={q} selected={selected} revealed={revealed} onSelect={setSelected} />
        ) : (
          <GridIn
            answer={answer}
            revealed={revealed}
            correct={isCorrect}
            onChange={setAnswer}
            onEnter={canCheck && !revealed ? check : undefined}
          />
        )}

        {revealed ? (
          <div
            className={`mt-5 overflow-hidden rounded-card border ${isCorrect ? "border-success/30" : "border-danger/30"}`}
          >
            <div className={`border-l-[3px] px-4 py-3.5 ${isCorrect ? "border-l-success bg-success-bg" : "border-l-danger bg-danger-bg"}`}>
              <div className={`flex items-center gap-2 ${label} ${isCorrect ? "text-success-600" : "text-danger-600"}`}>
                {isCorrect ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
                {isCorrect ? "Correct" : "Not quite"}
              </div>
              <p className="mt-2 font-serif text-[15px] leading-relaxed text-exam-ink">
                {q.explanation}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          {revealed ? (
            <button type="button" onClick={next} className={primaryBtn}>
              {index + 1 >= questions.length ? "See results" : "Next question"}
            </button>
          ) : (
            <button type="button" onClick={check} disabled={!canCheck} className={primaryBtn}>
              Check answer
            </button>
          )}
        </div>
      </div>
      {calcOpen ? <CalculatorPanel onClose={() => setCalcOpen(false)} /> : null}
    </DrillShell>
  );
}

function Choices({
  question,
  selected,
  revealed,
  onSelect,
}: {
  question: Extract<AiMathQuestion, { kind: "mc" }>;
  selected: ChoiceId | null;
  revealed: boolean;
  onSelect: (id: ChoiceId) => void;
}) {
  return (
    <div className="mt-4 space-y-2.5">
      {question.choices.map((c) => {
        const isSel = selected === c.id;
        const isAnswer = c.id === question.correct;
        let cls = "border-exam-border bg-white hover:border-navy/40";
        if (revealed && isAnswer) cls = "border-success bg-success-bg";
        else if (revealed && isSel) cls = "border-danger bg-danger-bg";
        else if (isSel) cls = "border-exam-select bg-exam-tint";
        return (
          <button
            key={c.id}
            type="button"
            disabled={revealed}
            onClick={() => onSelect(c.id)}
            aria-pressed={isSel}
            className={`flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left transition-colors disabled:cursor-default ${cls}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border text-sm font-semibold ${
                isSel ? "border-exam-select bg-exam-select text-white" : "border-exam-border text-exam-ink"
              }`}
            >
              {c.id}
            </span>
            <span className="font-serif text-[16px] text-exam-ink">{c.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function GridIn({
  answer,
  revealed,
  correct,
  onChange,
  onEnter,
}: {
  answer: string;
  revealed: boolean;
  correct: boolean;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  const border = revealed ? (correct ? "border-success" : "border-danger") : "border-navy/25 focus:border-brand";
  return (
    <div className="mt-5">
      <label htmlFor="aimath-answer" className={`${label} block text-navy/50`}>
        Enter your answer
      </label>
      <input
        id="aimath-answer"
        value={answer}
        disabled={revealed}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        autoComplete="off"
        placeholder="Type your answer"
        className={`mt-2 w-44 rounded-card border bg-white px-3 py-2 text-center font-serif text-lg tabular-nums text-exam-ink outline-none transition-colors placeholder:text-navy/30 focus:ring-2 focus:ring-brand/20 disabled:bg-paper/40 ${border}`}
      />
    </div>
  );
}
