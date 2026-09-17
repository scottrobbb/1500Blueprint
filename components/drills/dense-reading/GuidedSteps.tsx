"use client";
import { useDictation } from "../shared/useDictation";
import {
  PASS_LABELS,
  segmentCount,
  STEP_LABELS,
  TOPICS,
  wordCount,
} from "@/lib/dense-reading/method";
import type { ReadingAction } from "@/lib/dense-reading/state";
import {
  type ReadingProgress,
  type ReadingQuestion,
} from "@/lib/dense-reading/types";
import { field, ReadingButton } from "./ui";

export function GuidedSteps({
  question,
  progress: p,
  dispatch,
}: {
  question: ReadingQuestion;
  progress: ReadingProgress;
  dispatch: (action: ReadingAction) => void;
}) {
  const method = TOPICS[question.topic];
  const next = () => dispatch({ type: "next" });
  const current = question.choices.find((c) => c.id === p.order[p.choiceIndex]);
  const dictation = useDictation(p.prediction, (text) =>
    dispatch({ type: "prediction", text }),
  );
  return (
    <section
      aria-label="Guided steps"
      className="rounded-xl border border-brand/25 bg-white p-5 sm:p-6"
    >
      <p className="mb-2 text-xs font-medium text-brand-600">
        {method.title}
        {p.round ? ` · ${PASS_LABELS[p.round]}` : ""}
      </p>
      <h2
        aria-live="polite"
        tabIndex={-1}
        className="font-display text-xl font-semibold text-navy"
      >
        {p.step === "choice"
          ? `${p.deferred ? "Revisit" : "Analyze"} choice ${current?.id ?? ""}`
          : STEP_LABELS[p.step]}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-6 text-navy/75">
        {p.step === "preview" ? (
          <>
            <p
              className="text-3xl font-semibold tabular-nums text-navy"
              role="timer"
              aria-label="Preview seconds remaining"
            >
              {Math.max(0, Math.ceil((5000 - p.previewMs) / 1000))}
            </p>
            <p>
              Take a quick look. Decide whether to solve this question now or
              return to it at the end.
            </p>
            <ReadingButton
              onClick={() => dispatch({ type: "solve" })}
              className="w-full"
            >
              Solve now
            </ReadingButton>
            <ReadingButton
              secondary
              onClick={() => dispatch({ type: "skip" })}
              className="w-full"
            >
              Skip for later
            </ReadingButton>
          </>
        ) : null}
        {p.step === "round" ? (
          <>
            <p>
              Choose how confident you feel. Your answer is recorded with your
              results.
            </p>
            {([1, 2, 3] as const).map((round) => (
              <ReadingButton
                key={round}
                secondary
                onClick={() => dispatch({ type: "round", round })}
                className="w-full justify-start text-left"
              >
                {PASS_LABELS[round]} ·{" "}
                {round === 1
                  ? "Confident"
                  : round === 2
                    ? "Some uncertainty"
                    : "Difficult"}
              </ReadingButton>
            ))}
          </>
        ) : null}
        {p.step === "question" ? (
          <>
            <p>{method.question}</p>
            <ReadingButton onClick={next}>Continue</ReadingButton>
          </>
        ) : null}
        {p.step === "topic" ? (
          <>
            <p>
              Read the opening. Identify the subject and connect it to something
              you already understand.
            </p>
            <ReadingButton onClick={next}>I understand the topic</ReadingButton>
          </>
        ) : null}
        {p.step === "passage" ? (
          <>
            <p>
              Read five words at a time. {method.reading} Highlight words you
              want to return to.
            </p>
            <ReadingButton onClick={next}>
              {p.segment + 1 >= segmentCount(question)
                ? "Finished reading"
                : "Next segment"}
            </ReadingButton>
          </>
        ) : null}
        {p.step === "figure" ? (
          <>
            <p>
              Inspect the table headings, units, or graph axes and legend. Find
              the comparison the question needs, then check it against the
              passage.
            </p>
            <ReadingButton onClick={next}>Continue</ReadingButton>
          </>
        ) : null}
        {p.step === "prediction" ? (
          <>
            <label htmlFor="reading-prediction" className="block">
              {method.prediction}
            </label>
            <textarea
              id="reading-prediction"
              value={p.prediction}
              onChange={(event) =>
                dispatch({ type: "prediction", text: event.target.value })
              }
              rows={5}
              maxLength={4000}
              className={field}
              placeholder="Write your prediction…"
            />
            {dictation.supported ? (
              <ReadingButton secondary onClick={dictation.toggle}>
                {dictation.recording ? "Stop dictation" : "Speak prediction"}
              </ReadingButton>
            ) : null}
            <ReadingButton
              disabled={!p.prediction.trim()}
              onClick={next}
              className="w-full"
            >
              Continue to choices
            </ReadingButton>
          </>
        ) : null}
        {p.step === "crossout" ? (
          <>
            <p>
              Turn on cross-out mode to keep track of answers that the text does
              not support.
            </p>
            <ReadingButton onClick={() => dispatch({ type: "crossout" })}>
              Enable cross-out mode
            </ReadingButton>
          </>
        ) : null}
        {p.step === "choice" && current ? (
          <>
            <p>
              Read every word. Does the passage support the whole claim, and
              does it answer the question?
            </p>
            <p className="rounded-lg bg-haze p-4 font-serif text-lg leading-8 text-exam-ink">
              {current.text
                .split(/\s+/)
                .slice(0, p.word + 1)
                .join(" ")}
            </p>
            <p className="text-xs tabular-nums">
              Word {p.word + 1} of {wordCount(current.text)}
            </p>
            {p.word < wordCount(current.text) - 1 ? (
              <ReadingButton onClick={next}>Next word</ReadingButton>
            ) : (
              <div className="flex flex-wrap gap-2">
                <ReadingButton
                  onClick={() => dispatch({ type: "decide", keep: true })}
                >
                  Keep this choice
                </ReadingButton>
                <ReadingButton
                  secondary
                  onClick={() => dispatch({ type: "decide", keep: false })}
                >
                  Eliminate this choice
                </ReadingButton>
              </div>
            )}
          </>
        ) : null}
        {p.step === "confidence" ? (
          <>
            <p>
              Can you explain why the other answers are wrong? Check that every
              part of your preferred answer is supported by the passage.
            </p>
            <ReadingButton onClick={next} className="w-full">
              Yes, select my answer
            </ReadingButton>
            <ReadingButton
              secondary
              onClick={() => dispatch({ type: "uncertain" })}
              className="w-full"
            >
              Read the passage again
            </ReadingButton>
          </>
        ) : null}
        {p.step === "select" ? (
          <>
            <p>
              Choose your answer in the question panel. It will be locked for
              this guided round once submitted.
            </p>
            <ReadingButton disabled={!p.answer} onClick={next}>
              Submit answer
            </ReadingButton>
          </>
        ) : null}
        {p.step === "done" ? (
          <p>
            This answer is locked. Use the navigator to continue or review the
            round.
          </p>
        ) : null}
      </div>
    </section>
  );
}
