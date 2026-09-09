"use client";
import { useDictation } from "../shared/useDictation";
import {
  choiceFlags,
  flagVocabulary,
  segmentCount,
  STEP_LABELS,
  suggestedOrder,
  TOPICS,
  wordCount,
} from "@/lib/dense-reading/method";
import type { ReadingAction } from "@/lib/dense-reading/state";
import {
  CHOICES,
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
  const flags = choiceFlags(question);
  const vocabulary = flagVocabulary(question.topic);
  const order = suggestedOrder(question, p.round !== 1);
  const mismatches = CHOICES.filter(
    (id) => (p.flags[id] ?? "neutral") !== flags[id].flag,
  );
  return (
    <section
      aria-label="Guided steps"
      className="rounded-xl border border-brand/25 bg-white p-5 sm:p-6"
    >
      <p className="mb-2 text-xs font-medium text-brand-600">
        {method.title}
        {p.round ? ` · Round ${p.round}` : ""}
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
              Choose how confident you feel. Rounds 2 and 3 include a flag scan
              before analyzing the answers.
            </p>
            {([1, 2, 3] as const).map((round) => (
              <ReadingButton
                key={round}
                secondary
                onClick={() => dispatch({ type: "round", round })}
                className="w-full justify-start text-left"
              >
                Round {round} ·{" "}
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
        {p.step === "flags" ? (
          <>
            <p>
              Use the {vocabulary.name} scan to decide which choices to examine
              first. Flags are clues, not proof that an answer is wrong.
            </p>
            <p>
              <strong>Red:</strong> {vocabulary.red.join(", ")}
              <br />
              <strong>Green:</strong> {vocabulary.green.join(", ")}
            </p>
            <p>
              A word repeated across choices is neutral. Red takes precedence
              when both colors apply.
            </p>
            {question.choices.map((c) => (
              <div key={c.id} className="rounded-lg border border-navy/12 p-3">
                <p className="mb-2">
                  <strong>{c.id}.</strong> {c.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["red", "green", "neutral"] as const).map((flag) => (
                    <button
                      key={flag}
                      disabled={p.flagsChecked}
                      aria-pressed={(p.flags[c.id] ?? "neutral") === flag}
                      onClick={() =>
                        dispatch({ type: "flag", choice: c.id, flag })
                      }
                      className={`min-h-11 rounded-lg border px-3 text-sm capitalize disabled:cursor-default ${(p.flags[c.id] ?? "neutral") === flag ? "border-brand bg-ice text-navy" : "border-navy/15 text-navy/70"}`}
                    >
                      {flag}
                    </button>
                  ))}
                </div>
                {p.flagsChecked ? (
                  <p className="mt-2 text-xs text-navy/70">
                    {flags[c.id].flag === "neutral"
                      ? "Neutral"
                      : `${flags[c.id].flag === "red" ? "Red" : "Green"}: ${flags[c.id].words.join(", ")}`}
                    {flags[c.id].repeated.length
                      ? `. Repeated across choices: ${flags[c.id].repeated.join(", ")}.`
                      : ""}
                  </p>
                ) : null}
              </div>
            ))}
            {p.flagsChecked ? (
              <p role="status">
                {mismatches.length
                  ? `Check ${mismatches.join(", ")}. The next step uses the corrected flags above.`
                  : "All flags identified correctly."}
              </p>
            ) : null}
            <ReadingButton onClick={next}>
              {p.flagsChecked ? "Continue" : "Check flags"}
            </ReadingButton>
          </>
        ) : null}
        {p.step === "order" ? (
          <>
            <p>
              Read shorter choices first, then test every claim against the
              passage. Red-flagged choices can be revisited later.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {order.map((id) => (
                <ReadingButton
                  secondary
                  key={id}
                  aria-pressed={p.order.includes(id)}
                  onClick={() =>
                    dispatch({
                      type: "order",
                      order: p.order.includes(id)
                        ? p.order.filter((value) => value !== id)
                        : [...p.order, id],
                    })
                  }
                >
                  {id} ·{" "}
                  {wordCount(question.choices.find((c) => c.id === id)!.text)}{" "}
                  words
                  {p.order.includes(id) ? ` · ${p.order.indexOf(id) + 1}` : ""}
                </ReadingButton>
              ))}
            </div>
            <ReadingButton
              secondary
              onClick={() => dispatch({ type: "order", order })}
              className="w-full"
            >
              Use suggested order: {order.join(" → ")}
            </ReadingButton>
            <ReadingButton
              disabled={
                p.order.length !== order.length ||
                order.some((id) => !p.order.includes(id))
              }
              onClick={next}
            >
              Confirm order
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
              {p.order.length < 4
                ? "Review deferred choices"
                : "Read the passage again"}
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
