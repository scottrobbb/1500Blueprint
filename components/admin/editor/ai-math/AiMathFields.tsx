"use client";

// Field editor for the "ai-math" drill. Edits ONLY question.content (the
// AiMathContent union): a kind toggle (mc | grid), then either 4 lettered
// choices + a correct radio, or a list of accepted grid-in answers. The shared
// shell owns stem / explanation / metadata, so we never touch those here.

import type { AiMathContent, FieldEditorProps, LetteredChoice } from "@/lib/drills/types";
import { chip, label, labelMuted, rule } from "@/components/drills/shared/ui";

const CHOICE_IDS: LetteredChoice["id"][] = ["A", "B", "C", "D"];

// Content can arrive malformed (older rows, freshly created questions). Narrow to
// a known-good union so the editor always has something coherent to render.
function asAiMath(content: AiMathContent | Record<string, unknown>): AiMathContent {
  const c = content as {
    kind?: string;
    accepted?: unknown;
    choices?: LetteredChoice[];
    correct?: LetteredChoice["id"];
  };
  if (c.kind === "grid") {
    return { kind: "grid", accepted: Array.isArray(c.accepted) ? (c.accepted as string[]) : [""] };
  }
  const raw = c.choices ?? [];
  const choices = CHOICE_IDS.map((id) => ({
    id,
    text: raw.find((x) => x?.id === id)?.text ?? "",
  }));
  const correct = c.correct && CHOICE_IDS.includes(c.correct) ? c.correct : "A";
  return { kind: "mc", choices, correct };
}

const fieldInput =
  "w-full rounded-card border border-navy/20 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Fields({ question, onChange }: FieldEditorProps) {
  const content = asAiMath(question.content);

  function setKind(kind: AiMathContent["kind"]) {
    if (kind === content.kind) return;
    const next: AiMathContent =
      kind === "mc"
        ? { kind: "mc", choices: CHOICE_IDS.map((id) => ({ id, text: "" })), correct: "A" }
        : { kind: "grid", accepted: [""] };
    // Keep the metadata answerType in lockstep with the format so the bank
    // label/filter never diverges from how the question actually plays.
    onChange({ content: next, answerType: kind === "mc" ? "mc_single" : "grid_in" });
  }

  return (
    <div className="space-y-5">
      <div>
        <div className={labelMuted}>Answer format</div>
        <div className="mt-2 inline-flex rounded-card border border-navy/15 bg-paper/40 p-1">
          {(["mc", "grid"] as const).map((k) => {
            const active = content.kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={active}
                className={`rounded-[6px] px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-navy/60 hover:text-navy"
                }`}
              >
                {k === "mc" ? "Multiple choice" : "Grid-in"}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`border-t ${rule} pt-5`}>
        {content.kind === "mc" ? (
          <McFields content={content} onChange={onChange} />
        ) : (
          <GridFields content={content} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function McFields({
  content,
  onChange,
}: {
  content: Extract<AiMathContent, { kind: "mc" }>;
  onChange: FieldEditorProps["onChange"];
}) {
  function setText(id: LetteredChoice["id"], text: string) {
    const choices = content.choices.map((c) => (c.id === id ? { ...c, text } : c));
    onChange({ content: { ...content, choices } });
  }

  function setCorrect(correct: LetteredChoice["id"]) {
    onChange({ content: { ...content, correct } });
  }

  return (
    <div className="space-y-2.5">
      <div className={labelMuted}>Choices: select the correct answer</div>
      {content.choices.map((c) => {
        const isCorrect = content.correct === c.id;
        return (
          <div
            key={c.id}
            className={`flex items-center gap-3 rounded-card border px-3 py-2 transition-colors ${
              isCorrect ? "border-success/40 bg-success-bg" : "border-navy/15 bg-white"
            }`}
          >
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="aimath-correct"
                checked={isCorrect}
                onChange={() => setCorrect(c.id)}
                className="h-4 w-4 accent-success-600"
              />
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-chip border text-sm font-semibold ${
                  isCorrect ? "border-success bg-success text-white" : "border-navy/20 text-navy/70"
                }`}
              >
                {c.id}
              </span>
            </label>
            <input
              value={c.text}
              onChange={(e) => setText(c.id, e.target.value)}
              autoComplete="off"
              placeholder={`Choice ${c.id} (supports $LaTeX$)`}
              className={fieldInput}
            />
          </div>
        );
      })}
    </div>
  );
}

function GridFields({
  content,
  onChange,
}: {
  content: Extract<AiMathContent, { kind: "grid" }>;
  onChange: FieldEditorProps["onChange"];
}) {
  const accepted = content.accepted.length ? content.accepted : [""];

  function setAnswer(i: number, value: string) {
    const next = accepted.map((a, idx) => (idx === i ? value : a));
    onChange({ content: { kind: "grid", accepted: next } });
  }

  function addAnswer() {
    onChange({ content: { kind: "grid", accepted: [...accepted, ""] } });
  }

  function removeAnswer(i: number) {
    const next = accepted.filter((_, idx) => idx !== i);
    onChange({ content: { kind: "grid", accepted: next.length ? next : [""] } });
  }

  return (
    <div className="space-y-2.5">
      <div className={labelMuted}>Accepted answers: any exact match is correct</div>
      {accepted.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={a}
            onChange={(e) => setAnswer(i, e.target.value)}
            autoComplete="off"
            placeholder="e.g. 240 or 3/4"
            className={`${fieldInput} font-serif tabular-nums`}
          />
          <button
            type="button"
            onClick={() => removeAnswer(i)}
            disabled={accepted.length === 1}
            aria-label={`Remove answer ${i + 1}`}
            className="shrink-0 rounded-card border border-navy/20 px-3 py-2 text-sm font-semibold text-navy/60 transition-colors hover:bg-navy/5 disabled:opacity-30"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAnswer}
        className={`${chip} border border-navy/20 text-navy/70 hover:bg-navy/5`}
      >
        + Add answer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview: read-only, student-faithful render mirroring AiMathDrill's card.
// ---------------------------------------------------------------------------

import type { DrillQuestion } from "@/lib/drills/types";
import { surface } from "@/components/drills/shared/ui";
import { SparkIcon } from "@/components/drills/shared/icons";
import { MathText } from "@/components/test/MathText";

export function Preview({ question }: { question: DrillQuestion }) {
  const content = asAiMath(question.content);
  const prompt = question.stem ?? "";

  return (
    <div className={`${surface} p-5 sm:p-7`}>
      <div className="flex items-center gap-2">
        <span className={`${chip} bg-brand/10 text-brand-600`}>
          <SparkIcon className="h-3 w-3" />
          AI-generated
        </span>
        <span className={`${chip} bg-navy/8 text-navy/60`}>Beta</span>
      </div>

      <p className="mt-4 font-serif text-[17px] leading-relaxed text-exam-ink">
        {prompt ? <MathText>{prompt}</MathText> : <span className="text-navy/30">No prompt yet</span>}
      </p>

      {content.kind === "mc" ? (
        <div className="mt-4 space-y-2.5">
          {content.choices.map((c) => {
            const isAnswer = c.id === content.correct;
            return (
              <div
                key={c.id}
                className={`flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left ${
                  isAnswer ? "border-success bg-success-bg" : "border-exam-border bg-white"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border text-sm font-semibold ${
                    isAnswer ? "border-success bg-success text-white" : "border-exam-border text-exam-ink"
                  }`}
                >
                  {c.id}
                </span>
                <span className="font-serif text-[16px] text-exam-ink">
                  {c.text ? <MathText>{c.text}</MathText> : <span className="text-navy/30">-</span>}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <div className={`${label} block text-navy/50`}>Enter your answer</div>
          <div className="mt-2 flex w-44 items-center justify-center rounded-card border border-navy/25 bg-white px-3 py-2 font-serif text-lg tabular-nums text-navy/30">
            answer
          </div>
          <p className="mt-2 text-xs text-navy/45">
            Accepts: <span className="font-medium text-navy/65">{content.accepted.filter(Boolean).join(", ") || "-"}</span>
          </p>
        </div>
      )}
    </div>
  );
}
