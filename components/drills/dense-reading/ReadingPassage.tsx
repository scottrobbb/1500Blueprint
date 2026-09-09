"use client";
import { HighlightablePassage } from "@/components/test/HighlightablePassage";
import { MathText } from "@/components/test/MathText";
import { passageWords } from "@/lib/dense-reading/method";
import type {
  ReadingProgress,
  ReadingQuestion,
} from "@/lib/dense-reading/types";
import type { ReadingAction } from "@/lib/dense-reading/state";

export function ReadingPassage({
  question,
  progress,
  guided,
  highlighter,
  readOnly = false,
  dispatch,
}: {
  question: ReadingQuestion;
  progress: ReadingProgress;
  guided: boolean;
  highlighter: boolean;
  readOnly?: boolean;
  dispatch: (action: ReadingAction) => void;
}) {
  const segmented =
    guided && (progress.step === "topic" || progress.step === "passage");
  const obscured =
    (guided && ["round", "question"].includes(progress.step)) ||
    (guided && progress.step === "preview" && progress.previewMs >= 5000);
  const words = passageWords(question.passage);
  const segment = progress.step === "topic" ? 0 : progress.segment;
  const from = segment * 5;
  const visible = words.slice(from, from + 5);
  const changeHighlights = (highlights: ReadingProgress["highlights"]) =>
    dispatch({ type: "highlights", highlights });
  const highlighted = visible.some((word) =>
    progress.highlights.some((h) => h.start < word.end && h.end > word.start),
  );
  return (
    <section
      aria-label="Reading passage"
      className="min-w-0 [&_mark]:text-static-ink rounded-xl border border-navy/12 bg-white p-5 sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-navy">Passage</h2>
        {segmented ? (
          <span className="text-xs tabular-nums text-navy/60">
            Words {from + 1}–{Math.min(from + 5, words.length)} of{" "}
            {words.length}
          </span>
        ) : null}
      </div>
      {obscured ? (
        <p className="rounded-lg bg-haze p-6 text-sm leading-6 text-navy/60">
          The passage will appear when you reach the reading step.
        </p>
      ) : segmented ? (
        <>
          <div
            className="whitespace-pre-wrap font-serif text-lg leading-9 text-exam-ink"
            aria-label={`Passage segment ${segment + 1}`}
          >
            {words.map((word, i) =>
              i >= from && i < from + 5 ? (
                <span
                  key={i}
                  className={`${word.underlined ? "underline underline-offset-4" : ""} ${progress.highlights.some((h) => h.start < word.end && h.end > word.start) ? "bg-gold/30" : ""}`}
                >
                  {word.text}
                </span>
              ) : (
                <span
                  key={i}
                  aria-hidden="true"
                  className="select-none rounded bg-navy/[0.08] text-transparent"
                >
                  {"▰".repeat(Math.min(8, word.text.trim().length))}{" "}
                </span>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const start = visible[0]?.start ?? 0;
              const end = visible.at(-1)?.end ?? 0;
              changeHighlights(
                highlighted
                  ? progress.highlights.filter(
                      (h) => !(h.start < end && h.end > start),
                    )
                  : [
                      ...progress.highlights,
                      { id: crypto.randomUUID(), start, end, color: "#fde68a" },
                    ],
              );
            }}
            className="mt-5 min-h-11 rounded-lg border border-navy/15 px-3 text-sm text-navy hover:bg-haze focus-visible:outline-2 focus-visible:outline-brand"
          >
            {highlighted
              ? "Remove segment highlight"
              : "Highlight this segment"}
          </button>
        </>
      ) : /\\begin\{|\\\(|\\\[|\$\$/.test(question.passage) ? (
        <div className="overflow-x-auto whitespace-pre-wrap font-serif text-[17px] leading-8">
          <MathText>{question.passage}</MathText>
        </div>
      ) : (
        <HighlightablePassage
          text={question.passage}
          highlights={
            readOnly
              ? progress.highlights.map((highlight) => ({
                  ...highlight,
                  note: undefined,
                }))
              : progress.highlights
          }
          enabled={highlighter && !readOnly}
          onAdd={(h) =>
            changeHighlights([
              ...progress.highlights.filter((old) => old.id !== h.id),
              h,
            ])
          }
          onRemove={(start, end) =>
            changeHighlights(
              progress.highlights.filter(
                (h) => !(h.start < end && h.end > start),
              ),
            )
          }
          onSetNote={(id, note) =>
            changeHighlights(
              progress.highlights.map((h) =>
                h.id === id ? { ...h, note } : h,
              ),
            )
          }
          className="whitespace-pre-wrap font-serif text-[17px] leading-8 text-exam-ink"
        />
      )}
      {readOnly && progress.highlights.some((highlight) => highlight.note) ? (
        <div className="mt-5 border-t border-navy/10 pt-4">
          <h3 className="text-sm font-semibold text-navy">
            Your passage notes
          </h3>
          {progress.highlights
            .filter((highlight) => highlight.note)
            .map((highlight) => (
              <p
                key={highlight.id}
                className="mt-2 whitespace-pre-wrap text-sm leading-6 text-navy/70"
              >
                {highlight.note}
              </p>
            ))}
        </div>
      ) : null}
      {question.figureUrl && !obscured && !segmented ? (
        <div className="mt-6 overflow-x-auto rounded-lg bg-static-white p-2">
          {/* Imported figures retain their original colors. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.figureUrl}
            alt="Figure for this reading question"
            className="mx-auto h-auto max-h-[420px] max-w-full object-contain"
          />
        </div>
      ) : null}
    </section>
  );
}
