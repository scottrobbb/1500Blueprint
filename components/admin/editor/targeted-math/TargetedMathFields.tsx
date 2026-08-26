"use client";

import { MathText } from "@/components/test/MathText";
import { TrashIcon } from "@/components/test/icons";
import { chip, label, secondaryBtn, surface } from "@/components/drills/shared/ui";
import type {
  DrillQuestion,
  FieldEditorProps,
  LetteredChoice,
  TargetedMathContent,
} from "@/lib/drills/types";

const CHOICE_IDS: LetteredChoice["id"][] = ["A", "B", "C", "D"];
const fieldInput =
  "w-full rounded-card border border-navy/20 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/20";

function asContent(question: DrillQuestion): TargetedMathContent {
  const raw = question.content as {
    kind?: string;
    accepted?: unknown;
    choices?: LetteredChoice[];
    correct?: LetteredChoice["id"];
  };
  if (question.answerType === "mc_single") {
    const choices = CHOICE_IDS.map((id) => ({
      id,
      text: raw.choices?.find((choice) => choice?.id === id)?.text ?? "",
    }));
    return {
      kind: "mc",
      choices,
      correct: raw.correct && CHOICE_IDS.includes(raw.correct) ? raw.correct : "A",
    };
  }
  return {
    kind: "grid",
    accepted: Array.isArray(raw.accepted) ? raw.accepted.filter((value): value is string => typeof value === "string") : [],
  };
}

function metadata(question: DrillQuestion): Record<string, unknown> {
  const rest = { ...question.content } as Record<string, unknown>;
  delete rest.kind;
  delete rest.accepted;
  delete rest.choices;
  delete rest.correct;
  return rest;
}

export function Fields({ question, onChange }: FieldEditorProps) {
  const content = asContent(question);
  const extra = metadata(question);

  function setFormat(answerType: "mc_single" | "grid_in") {
    if (answerType === question.answerType) return;
    const next: TargetedMathContent = answerType === "mc_single"
      ? { kind: "mc", choices: CHOICE_IDS.map((id) => ({ id, text: "" })), correct: "A" }
      : { kind: "grid", accepted: [""] };
    onChange({ answerType, content: { ...extra, ...next } });
  }

  return (
    <div className="space-y-5">
      <div>
        <div className={`${label} text-navy/50`}>Answer format</div>
        <div className="mt-2 inline-flex rounded-card border border-navy/15 bg-paper/40 p-1">
          {(["mc_single", "grid_in"] as const).map((answerType) => {
            const active = question.answerType === answerType;
            return (
              <button
                key={answerType}
                type="button"
                onClick={() => setFormat(answerType)}
                aria-pressed={active}
                className={`rounded-[6px] px-4 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-navy text-white" : "text-navy/60 hover:text-navy"}`}
              >
                {answerType === "mc_single" ? "Multiple choice" : "Grid-in"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-navy/10 pt-5">
        {content.kind === "mc" ? (
          <MultipleChoiceFields question={question} content={content} extra={extra} onChange={onChange} />
        ) : (
          <GridInFields question={question} content={content} extra={extra} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function MultipleChoiceFields({
  question,
  content,
  extra,
  onChange,
}: {
  question: DrillQuestion;
  content: Extract<TargetedMathContent, { kind: "mc" }>;
  extra: Record<string, unknown>;
  onChange: FieldEditorProps["onChange"];
}) {
  function commit(choices: LetteredChoice[], correct = content.correct) {
    onChange({
      answerType: "mc_single",
      content: { ...extra, kind: "mc", choices, correct },
      includeInQuestionBank: question.includeInQuestionBank,
    });
  }

  return (
    <div className="space-y-2.5">
      <div className={`${label} text-navy/50`}>Choices: select the correct answer</div>
      {content.choices.map((choice) => {
        const correct = content.correct === choice.id;
        return (
          <div key={choice.id} className={`flex items-center gap-3 rounded-card border px-3 py-2 ${correct ? "border-success/40 bg-success-bg" : "border-navy/15 bg-white"}`}>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="targeted-math-correct"
                checked={correct}
                onChange={() => commit(content.choices, choice.id)}
                className="h-4 w-4 accent-success-600"
              />
              <span className={`flex h-7 w-7 items-center justify-center rounded-chip border text-sm font-semibold ${correct ? "border-success bg-success text-white" : "border-navy/20 text-navy/70"}`}>
                {choice.id}
              </span>
            </label>
            <input
              value={choice.text}
              onChange={(event) => commit(content.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item))}
              placeholder={`Choice ${choice.id} (supports $LaTeX$)`}
              className={fieldInput}
            />
          </div>
        );
      })}
    </div>
  );
}

function GridInFields({
  question,
  content,
  extra,
  onChange,
}: {
  question: DrillQuestion;
  content: Extract<TargetedMathContent, { kind: "grid" }>;
  extra: Record<string, unknown>;
  onChange: FieldEditorProps["onChange"];
}) {
  const accepted = content.accepted;

  function commit(next: string[]) {
    onChange({
      answerType: "grid_in",
      content: { ...extra, kind: "grid", accepted: next },
      includeInQuestionBank: question.includeInQuestionBank,
    });
  }

  return (
    <div>
      <div className={`${label} text-navy/50`}>Accepted answers</div>
      <p className="mt-1 text-sm text-navy/55">
        Each entry is matched after normalizing whitespace, $, %, commas, and leading zeros. Add every acceptable form.
      </p>
      <div className="mt-3 space-y-2">
        {accepted.length === 0 ? <p className="text-sm text-navy/40">No accepted answers yet.</p> : accepted.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={value}
              onChange={(event) => commit(accepted.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))}
              inputMode="text"
              autoComplete="off"
              placeholder="e.g. 2/5"
              className="w-44 rounded-card border border-navy/25 bg-white px-3 py-2 text-center font-serif text-base tabular-nums text-exam-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button type="button" onClick={() => commit(accepted.filter((_, answerIndex) => answerIndex !== index))} aria-label="Remove answer" className="rounded-card border border-navy/15 p-2 text-navy/50 transition-colors hover:bg-danger-bg hover:text-danger-600">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => commit([...accepted, ""])} className={`${secondaryBtn} mt-3`}>
        Add answer
      </button>
    </div>
  );
}

export function Preview({ question }: { question: DrillQuestion }) {
  const content = asContent(question);
  const prompt = question.stem?.trim();

  return (
    <div className={`${surface} p-5`}>
      <p className="font-serif text-[17px] leading-relaxed text-exam-ink">
        {prompt ? <MathText>{prompt}</MathText> : <span className="text-navy/35">No prompt yet</span>}
      </p>
      {content.kind === "mc" ? (
        <div className="mt-5 space-y-2.5">
          {content.choices.map((choice) => (
            <div key={choice.id} className={`flex items-center gap-3 rounded-card border px-4 py-3 ${choice.id === content.correct ? "border-success bg-success-bg" : "border-navy/15 bg-white"}`}>
              <span className="font-semibold text-navy">{choice.id}.</span>
              <span className="font-serif text-[16px] text-exam-ink">{choice.text ? <MathText>{choice.text}</MathText> : "-"}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={`${label} mt-6 text-navy/50`}>Enter your answer</div>
          <div className="mt-2 w-44 rounded-card border border-navy/25 bg-white px-3 py-2 text-center font-serif text-lg text-navy/30">Type your answer</div>
          <div className={`${label} mt-5 text-navy/50`}>Accepted answers</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {content.accepted.length === 0 ? <span className="text-sm text-navy/40">None set</span> : content.accepted.map((answer, index) => (
              <span key={index} className={`${chip} bg-success-bg text-success-600`}><MathText>{answer}</MathText></span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
