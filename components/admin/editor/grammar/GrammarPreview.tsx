import { Fragment } from "react";
import type { DrillQuestion, GrammarContent, LetteredChoice } from "@/lib/drills/types";
import { MathText } from "@/components/test/MathText";

// Highlights the blank ("____") in the passage the same way the student card does.
function withBlank(passage: string | null | undefined) {
  if (!passage) return null;
  const parts = passage.split(/_{2,}/);
  if (parts.length === 1) return <MathText>{passage}</MathText>;
  return parts.map((part, i) => (
    <Fragment key={i}>
      <MathText>{part}</MathText>
      {i < parts.length - 1 ? (
        <span className="rounded-[3px] bg-flag-bg px-1.5 py-px align-baseline">_____</span>
      ) : null}
    </Fragment>
  ));
}

// Read-only render that mirrors the student GrammarQuestionView: passage over the
// four bubble choices, with the authored correct choice highlighted green.
export function Preview({ question }: { question: DrillQuestion }) {
  const content = question.content as Partial<GrammarContent>;
  const choices: LetteredChoice[] = content.choices ?? [];
  const correct = content.correct;

  return (
    <div className="rounded-xl border border-navy/15 bg-white p-6 sm:p-7">
      <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-navy/40">
        Question · choose the best version
      </div>

      {content.pattern ? (
        <div className="mb-3 inline-flex rounded-chip bg-brand/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
          {content.pattern}
        </div>
      ) : null}

      <p className="font-serif text-[18px] leading-[1.7] text-exam-ink">{withBlank(question.passage)}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        {choices.map((c) => {
          const isCorrect = correct === c.id;
          return (
            <div
              key={c.id}
              className={`flex w-full items-start gap-3.5 rounded-[10px] border-[1.5px] px-[17px] py-[15px] text-left font-serif text-base text-exam-ink ${
                isCorrect ? "border-success bg-success-bg" : "border-navy/15 bg-white"
              }`}
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-[1.5px] font-display text-[13px] font-bold ${
                  isCorrect ? "border-success bg-success text-white" : "border-navy/25 bg-white text-navy"
                }`}
              >
                {c.id}
              </span>
              <span className="flex-1">{c.text ? <MathText>{c.text}</MathText> : <span className="text-navy/30">Empty choice</span>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
