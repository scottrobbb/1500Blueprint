"use client";

import { useEffect, useRef, useState } from "react";
import type { AnswerValue, ChoiceId, Question, Section } from "@/lib/sat/types";
import { AnswerChoices } from "./AnswerChoices";
import { GridIn } from "./GridIn";
import { HighlightablePassage, type Highlight } from "./HighlightablePassage";
import { MathText } from "./MathText";
import { QuestionContent } from "./QuestionContent";
import { BookmarkIcon, BookmarkFilledIcon, DragHandleIcon } from "./icons";

type Props = {
  section: Section;
  question: Question;
  index: number;
  answer: AnswerValue | undefined;
  marked: boolean;
  eliminated: ChoiceId[];
  eliminatorOn: boolean;
  highlightEnabled: boolean;
  highlights: Highlight[];
  onSelect: (value: AnswerValue) => void;
  onToggleMark: () => void;
  onToggleEliminate: (choice: ChoiceId) => void;
  onToggleEliminator: () => void;
  onAddHighlight: (h: Highlight) => void;
  onRemoveHighlight: (start: number, end: number) => void;
  onSetNote: (id: string, note: string) => void;
  calcOpen: boolean;
};

function QuestionStrip({
  index,
  marked,
  eliminatorOn,
  onToggleMark,
  onToggleEliminator,
}: {
  index: number;
  marked: boolean;
  eliminatorOn: boolean;
  onToggleMark: () => void;
  onToggleEliminator: () => void;
}) {
  return (
    <div>
      <div className="flex h-10 items-center justify-between bg-[#f4f4f5] pr-3">
        <div className="flex h-full items-center gap-3">
          <span className="flex h-full w-10 items-center justify-center bg-black text-[18px] font-bold text-white">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={onToggleMark}
            aria-pressed={marked}
            className={`flex cursor-pointer items-center gap-1.5 text-[15px] ${
              marked
                ? "font-semibold text-exam-maroon underline underline-offset-2"
                : "font-normal text-exam-ink hover:text-exam-blue"
            }`}
          >
            {marked ? (
              <BookmarkFilledIcon className="h-[18px] w-[18px] text-exam-maroon" />
            ) : (
              <BookmarkIcon className="h-[18px] w-[18px]" />
            )}
            Mark for Review
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleEliminator}
          aria-pressed={eliminatorOn}
          aria-label="Toggle answer eliminator"
          title="Cross out answer choices"
          className={`flex h-7 cursor-pointer items-center rounded-md border-2 border-exam-blue px-2.5 text-[13px] font-bold leading-none transition-colors ${
            eliminatorOn
              ? "bg-exam-blue text-white"
              : "bg-white text-exam-blue hover:bg-exam-tint"
          }`}
        >
          <span className="line-through decoration-2">ABC</span>
        </button>
      </div>
      <div className="bb-perf" />
    </div>
  );
}

function Body(props: Props) {
  const { question, answer, eliminated, eliminatorOn, onSelect, onToggleEliminate } = props;
  return (
    <div className="mt-4 flex flex-col gap-5">
      {question.type === "mc" ? (
        <AnswerChoices
          question={question}
          selected={answer as ChoiceId | undefined}
          eliminated={eliminated}
          eliminatorOn={eliminatorOn}
          onSelect={(id) => onSelect(id)}
          onToggleEliminate={onToggleEliminate}
        />
      ) : (
        <GridIn value={(answer as string) ?? ""} onChange={(v) => onSelect(v)} />
      )}
    </div>
  );
}

export function QuestionScreen(props: Props) {
  const {
    section,
    question,
    index,
    marked,
    eliminatorOn,
    highlightEnabled,
    highlights,
    onToggleMark,
    onToggleEliminator,
    onAddHighlight,
    onRemoveHighlight,
    onSetNote,
    calcOpen,
  } = props;
  const isRW = section.id === "rw";
  const hasPassage = Boolean(question.passage);
  const hasPassageTable = question.passage?.includes("@@ROW@@") ?? false;

  const [isWide, setIsWide] = useState(true);
  const [leftPct, setLeftPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    // Two-pane (passage | question) only on true desktop widths — below this the
    // split panes are too narrow to read, so we fall back to a single column.
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(68, Math.max(32, pct)));
  }

  const strip = (
    <QuestionStrip
      index={index}
      marked={marked}
      eliminatorOn={eliminatorOn}
      onToggleMark={onToggleMark}
      onToggleEliminator={onToggleEliminator}
    />
  );

  const prompt = (
    <p className="font-serif text-[17px] font-normal leading-7 text-exam-ink">
      <MathText>{question.prompt}</MathText>
    </p>
  );

  const figure = question.figureUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={question.figureUrl}
      alt="Figure for this question"
      className="mb-4 max-h-80 max-w-full object-contain"
    />
  ) : null;

  // Reading & Writing with a passage → resizable two-pane on wide screens.
  if (isRW && hasPassage && isWide) {
    return (
      <main ref={containerRef} className="flex flex-1 overflow-hidden">
        <section className="overflow-y-auto px-10 py-8" style={{ width: `${leftPct}%` }} aria-label="Passage">
          {figure}
          {hasPassageTable ? (
            <QuestionContent
              text={question.passage ?? ""}
              pClassName="font-serif text-[17px] leading-7 text-exam-ink"
            />
          ) : (
            <HighlightablePassage
              text={question.passage ?? ""}
              highlights={highlights}
              enabled={highlightEnabled}
              onAdd={onAddHighlight}
              onRemove={onRemoveHighlight}
              onSetNote={onSetNote}
            />
          )}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => {
            dragging.current = false;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
          }}
          className="group relative flex w-px shrink-0 cursor-col-resize justify-center bg-exam-border"
        >
          <span className="absolute top-1/2 flex h-9 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-exam-ink shadow-sm">
            <DragHandleIcon className="h-4 w-4 text-white" />
          </span>
        </div>

        <section className="flex-1 overflow-y-auto px-10 py-8" aria-label="Question">
          <div className="mx-auto max-w-3xl">
            {strip}
            <div className="mt-4">{prompt}</div>
            <Body {...props} />
          </div>
        </section>
      </main>
    );
  }

  // Math, or narrow screens → centered single column.
  // When the calculator is open, slide the question column right so the
  // floating calc (anchored left) doesn't sit on top of the content.
  return (
    <main
      className={`flex-1 overflow-y-auto transition-[padding] duration-300 ease-out ${
        calcOpen ? "lg:pl-[25rem]" : ""
      }`}
    >
      <div className="mx-auto max-w-3xl px-6 py-8">
        {strip}
        {hasPassage &&
          (isRW ? (
            <div className="mt-5">
              {figure}
              {hasPassageTable ? (
                <QuestionContent
                  text={question.passage ?? ""}
                  pClassName="font-serif text-[17px] leading-7 text-exam-ink"
                />
              ) : (
                <HighlightablePassage
                  text={question.passage ?? ""}
                  highlights={highlights}
                  enabled={highlightEnabled}
                  onAdd={onAddHighlight}
                  onRemove={onRemoveHighlight}
                  onSetNote={onSetNote}
                />
              )}
            </div>
          ) : (
            <QuestionContent
              text={question.passage ?? ""}
              pClassName="mt-5 text-left font-serif text-xl text-exam-ink"
            />
          ))}
        <div className="mt-5">{!(isRW && hasPassage) && figure}{prompt}</div>
        <Body {...props} />
      </div>
    </main>
  );
}
