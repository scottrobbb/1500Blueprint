"use client";

import { useState } from "react";
import Link from "next/link";
import type { AnswerMap, ChoiceId, Question, TestModule } from "@/lib/sat/types";
import { isCorrect } from "@/lib/sat/scoring";
import { formatTime } from "@/lib/sat/testState";
import type { PracticeModuleMeta } from "@/lib/sat/modules";
import { Logo } from "@/components/Logo";
import { ExplanationText } from "./ExplanationText";
import { MathText } from "./MathText";
import { QuestionContent } from "./QuestionContent";
import { CheckIcon, CloseIcon } from "./icons";

function answerText(q: Question, value: string | undefined): string {
  if (value == null || value === "") return "Omitted";
  if (q.type === "mc") {
    const choice = q.choices.find((c) => c.id === value);
    return choice ? `${choice.id}. ${choice.text}` : String(value);
  }
  return String(value);
}

function correctText(q: Question): string {
  if (q.type === "mc") {
    const choice = q.choices.find((c) => c.id === q.correct);
    return choice ? `${choice.id}. ${choice.text}` : q.correct;
  }
  return q.acceptedAnswers.join(" or ");
}

export function ModuleResults({
  meta,
  module,
  answers,
  perQuestionTime,
  timeUsedSeconds,
  slug,
  onRestart,
  savedHref,
  attemptDate,
  backHref,
  modulesHref,
  testsHref = "/practice-test",
  saveStatus,
  saveError,
  onRetrySave,
}: {
  meta: PracticeModuleMeta;
  module: TestModule;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  timeUsedSeconds: number;
  slug: string;
  onRestart?: () => void;
  savedHref?: string;
  attemptDate?: string;
  backHref?: string;
  modulesHref?: string;
  testsHref?: string;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  saveError?: string | null;
  onRetrySave?: () => void;
}) {
  const [showOnlyWrong, setShowOnlyWrong] = useState(false);

  const total = module.questions.length;
  const correctCount = module.questions.reduce(
    (n, q) => n + (isCorrect(q, answers[q.id]) ? 1 : 0),
    0,
  );
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  const visible = showOnlyWrong
    ? module.questions.filter((q) => !isCorrect(q, answers[q.id]))
    : module.questions;

  return (
    <main className="min-h-dvh bg-ice/40">
      {/* Score header */}
      <section className="bg-navy text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
          <div className="flex items-center justify-between">
            <Logo className="text-white [&_.text-navy]:text-white" />
            <Link href={testsHref} className="text-sm text-white/70 hover:text-white">
              Practice tests
            </Link>
          </div>
          <div className="flex flex-col items-center text-center">
            <p className="text-sm uppercase tracking-wide text-sky">{meta.fullLabel}</p>
            <p className="font-display text-6xl font-extrabold">
              {correctCount}
              <span className="text-3xl text-white/50">/{total}</span>
            </p>
            <p className="text-sm text-white/60">
              {pct}% correct · {formatTime(timeUsedSeconds)} used
            </p>
            {attemptDate && <p className="mt-1 text-xs text-white/50">Taken {attemptDate}</p>}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {saveStatus === "saving" ? (
          <p role="status" className="mb-5 rounded-xl border border-brand/20 bg-white px-4 py-3 text-sm font-semibold text-navy">
            Saving this attempt to your history…
          </p>
        ) : null}
        {saveStatus === "error" ? (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{saveError ?? "This attempt has not been saved yet."}</span>
            {onRetrySave ? (
              <button type="button" onClick={onRetrySave} className="min-h-11 rounded-xl bg-red-700 px-4 font-semibold text-white hover:bg-red-800">
                Retry save
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-navy">Review your answers</h2>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={showOnlyWrong}
              onChange={(e) => setShowOnlyWrong(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Only incorrect
          </label>
        </div>

        <ol className="mt-4 space-y-4">
          {visible.map((q) => {
            const userValue = answers[q.id] as string | undefined;
            const correct = isCorrect(q, userValue);
            const time = perQuestionTime[q.id] ?? 0;
            const wrongChoiceExplanation =
              q.type === "mc" &&
              userValue &&
              userValue !== q.correct &&
              q.choiceExplanations?.[userValue as ChoiceId];

            return (
              <li key={q.id} className="rounded-2xl border border-ice-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-exam-muted">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                      correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {correct ? <CheckIcon className="h-3.5 w-3.5" /> : <CloseIcon className="h-3.5 w-3.5" />}
                    {correct ? "Correct" : "Incorrect"}
                  </span>
                  <span>{q.domain}</span>
                  <span>·</span>
                  <span className="capitalize">{q.difficulty}</span>
                  <span>·</span>
                  <span>{formatTime(time)} spent</span>
                </div>

                {q.passage && (
                  <QuestionContent
                    text={q.passage}
                    pClassName="mt-3 whitespace-pre-line border-l-2 border-ice-200 pl-3 text-sm leading-6 text-exam-muted"
                  />
                )}
                <p className="mt-3 text-[15px] font-medium leading-7 text-ink">
                  <MathText>{q.prompt}</MathText>
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div
                    className={`whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                      correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-wide opacity-70">Your answer</span>
                    <MathText>{answerText(q, userValue)}</MathText>
                  </div>
                  <div className="whitespace-pre-line rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                    <span className="block text-xs uppercase tracking-wide opacity-70">Correct answer</span>
                    <MathText>{correctText(q)}</MathText>
                  </div>
                </div>

                {q.explanation && (
                  <p className="mt-3 text-sm leading-6 text-ink">
                    <span className="font-semibold">Why: </span>
                    <ExplanationText text={q.explanation} />
                  </p>
                )}
                {wrongChoiceExplanation && (
                  <p className="mt-1 text-sm leading-6 text-red-700">
                    <span className="font-semibold">Your choice: </span>
                    <MathText>{wrongChoiceExplanation}</MathText>
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {onRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Practice this module again
            </button>
          )}
          {savedHref && (
            <Link
              href={savedHref}
              className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink hover:bg-ice"
            >
              View saved report
            </Link>
          )}
          {backHref && (
            <Link
              href={backHref}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Back to attempts
            </Link>
          )}
          <Link
            href={modulesHref ?? `/practice-test/${slug}/modules`}
            className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink hover:bg-ice"
          >
            Other modules
          </Link>
          <Link
            href={testsHref}
            className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink hover:bg-ice"
          >
            Back to tests
          </Link>
        </div>
      </div>
    </main>
  );
}
