import { Fragment } from "react";
import type { GrammarQuestion } from "@/lib/drills/types";
import type { ChoiceId } from "@/lib/sat/types";
import { MathText } from "@/components/test/MathText";

// Renders the question sentence in serif, with any blank ("____") highlighted.
function withBlank(passage: string | undefined) {
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

// Single-column question card: serif stimulus over bubble-style answer choices.
// Royal-blue selection keeps the question content close to the real exam look
// while the rounded card matches the gamified shell.
export function GrammarQuestionView({
  question,
  selected,
  onSelect,
}: {
  question: GrammarQuestion;
  selected: ChoiceId | null;
  onSelect: (id: ChoiceId) => void;
}) {
  return (
    <div className="rounded-xl border border-navy/15 bg-white p-6 sm:p-7">
      <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-navy/40">
        Question · choose the best version
      </div>
      <p className="font-serif text-[18px] leading-[1.7] text-exam-ink">{withBlank(question.passage)}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        {question.choices.map((c) => {
          const isSelected = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={isSelected}
              className={`flex w-full items-start gap-3.5 rounded-[10px] border-[1.5px] px-[17px] py-[15px] text-left font-serif text-base text-exam-ink transition-[background-color,border-color,box-shadow] ${
                isSelected
                  ? "border-brand-600 bg-exam-tint shadow-[0_0_0_3px_rgba(63,169,245,0.14)]"
                  : "border-navy/15 bg-white hover:border-navy/30"
              }`}
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-[1.5px] font-display text-[13px] font-bold ${
                  isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-navy/25 bg-white text-navy"
                }`}
              >
                {c.id}
              </span>
              <span className="flex-1">
                <MathText>{c.text}</MathText>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
