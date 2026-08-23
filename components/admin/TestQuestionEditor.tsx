"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import type { AdminChoice, AdminQuestion, QuestionType } from "@/lib/sat/admin-queries";
import { MathText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import { UnderlineIcon } from "@/components/test/icons";
import { label, primaryBtn, secondaryBtn } from "@/components/drills/shared/ui";
import { ChevronRightIcon } from "@/components/shell/icons";
import { FigureUploadField } from "@/components/admin/editor/FigureUploadField";

// Dedicated editor for ONE practice-test question (tests/questions/choices).
// Separate from the drill CMS's QuestionEditor because the shape differs: fixed
// A–D choice rows with a correct letter + per-choice rationale, or a grid-in
// with accepted answers — no per-drill `content` blob, no walkthrough steps.

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LETTERS: ChoiceId[] = ["A", "B", "C", "D"];
const DOMAINS = [
  "Information and Ideas",
  "Craft and Structure",
  "Expression of Ideas",
  "Standard English Conventions",
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
];

type Saving = "idle" | "saving" | "deleting";

// Local, fully-editable copy of the question. acceptedAnswers is edited as one
// answer per line and split on save.
type Draft = {
  type: QuestionType;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  passage: string;
  prompt: string;
  figureUrl: string;
  correct: ChoiceId | null;
  acceptedText: string;
  explanation: string;
  explanationSource: string;
  needsReview: boolean;
  choices: AdminChoice[];
};

function toDraft(q: AdminQuestion): Draft {
  const byLetter = new Map(q.choices.map((c) => [c.letter, c]));
  // Always present all four A–D rows so multiple-choice editing is predictable,
  // even if the stored question is missing some (or is currently a grid-in).
  const choices: AdminChoice[] = LETTERS.map(
    (letter) =>
      byLetter.get(letter) ?? { id: `new-${letter}`, letter, text: "", explanation: null },
  );
  return {
    type: q.type,
    domain: q.domain ?? "",
    skill: q.skill ?? "",
    difficulty: q.difficulty,
    passage: q.passage ?? "",
    prompt: q.prompt ?? "",
    figureUrl: q.figureUrl ?? "",
    correct: q.correct,
    acceptedText: q.acceptedAnswers.join("\n"),
    explanation: q.explanation ?? "",
    explanationSource: q.explanationSource ?? "human",
    needsReview: q.needsReview,
    choices,
  };
}

export function TestQuestionEditor({
  question,
  nextQuestionHref,
  testsBasePath = "/admin/tests",
}: {
  question: AdminQuestion;
  nextQuestionHref: string | null;
  testsBasePath?: string;
}) {
  const router = useRouter();
  const backHref = question.context ? `${testsBasePath}/${question.context.testSlug}` : testsBasePath;

  const [draft, setDraft] = useState<Draft>(() => toDraft(question));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = saving !== "idle";

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
    setDirty(true);
    setError(null);
  }

  function patchChoice(letter: ChoiceId, next: Partial<AdminChoice>) {
    setDraft((prev) => ({
      ...prev,
      choices: prev.choices.map((c) => (c.letter === letter ? { ...c, ...next } : c)),
    }));
    setDirty(true);
    setError(null);
  }

  function navigateTo(href: string) {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    router.push(href);
  }

  async function onSave() {
    const acceptedAnswers = draft.acceptedText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // Light validation so a saved question is at least gradeable.
    if (draft.type === "mc" && !draft.correct) {
      return setError("Pick which choice is correct.");
    }
    if (draft.type === "grid" && acceptedAnswers.length === 0) {
      return setError("Add at least one accepted answer for a grid-in.");
    }

    setSaving("saving");
    setError(null);
    try {
      const res = await fetch(`/admin/api/test-questions/${question.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          domain: draft.domain,
          skill: draft.skill,
          difficulty: draft.difficulty,
          passage: draft.passage,
          prompt: draft.prompt,
          figureUrl: draft.figureUrl,
          correct: draft.correct,
          acceptedAnswers,
          explanation: draft.explanation,
          explanationSource: draft.explanationSource,
          needsReview: draft.needsReview,
          choices: draft.choices.map((c) => ({
            letter: c.letter,
            text: c.text,
            explanation: c.explanation,
          })),
        }),
      });
      if (!res.ok) {
        const result = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(result?.detail ?? "Save failed. Please try again.");
        return;
      }
      setDirty(false);
      router.refresh();
    } catch {
      setError("Save failed. Check your connection and retry.");
    } finally {
      setSaving("idle");
    }
  }

  async function onDelete() {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setSaving("deleting");
    try {
      const res = await fetch(`/admin/api/test-questions/${question.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push(backHref);
        router.refresh();
        return;
      }
      const result = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(result?.detail ?? "Delete failed. Please try again.");
    } catch {
      setError("Delete failed. Check your connection and retry.");
    } finally {
      setSaving("idle");
    }
  }

  const ctx = question.context;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3 rounded-card border border-navy/15 bg-white px-4 py-3">
        <span className="font-mono text-[13px] text-navy/45">#{question.id.slice(0, 8)}</span>
        {ctx ? (
          <span className="font-display text-sm font-bold text-navy">
            {ctx.moduleLabel} · Q{question.position}
          </span>
        ) : null}
        {draft.needsReview ? (
          <span className="inline-flex items-center rounded-chip bg-gold/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-600">
            Needs review
          </span>
        ) : null}
        {dirty ? <span className="text-[12px] font-medium text-gold-600">Unsaved changes</span> : null}

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => navigateTo(backHref)} disabled={busy} className={secondaryBtn}>
            Back
          </button>
          <button type="button" onClick={onSave} disabled={busy || !dirty} className={primaryBtn}>
            {saving === "saving" ? "Saving…" : "Save changes"}
          </button>
          <NextButton href={nextQuestionHref} busy={busy} onNavigate={navigateTo} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        {/* ---- Form ---- */}
        <div className="flex flex-col gap-5">
          <section className="rounded-card border border-navy/15 bg-white p-4">
            <h2 className={`${label} mb-4 text-navy/55`}>Metadata</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field labelText="Type">
                <select
                  value={draft.type}
                  onChange={(e) => patch({ type: e.target.value as QuestionType })}
                  className={selectClass}
                >
                  <option value="mc">Multiple choice</option>
                  <option value="grid">Grid-in</option>
                </select>
              </Field>

              <Field labelText="Difficulty">
                <select
                  value={draft.difficulty}
                  onChange={(e) => patch({ difficulty: e.target.value as Difficulty })}
                  className={selectClass}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {capitalize(d)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field labelText="Domain">
                <input
                  list="test-domains"
                  value={draft.domain}
                  onChange={(e) => patch({ domain: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Algebra"
                />
                <datalist id="test-domains">
                  {DOMAINS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>

              <Field labelText="Skill">
                <input
                  value={draft.skill}
                  onChange={(e) => patch({ skill: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Linear equations in one variable"
                />
              </Field>

              <Field labelText="Explanation source">
                <select
                  value={draft.explanationSource}
                  onChange={(e) => patch({ explanationSource: e.target.value })}
                  className={selectClass}
                >
                  <option value="human">Human</option>
                  <option value="ai">AI</option>
                </select>
              </Field>

              <Field labelText="Review flag">
                <label className="flex h-[42px] items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={draft.needsReview}
                    onChange={(e) => patch({ needsReview: e.target.checked })}
                    className="h-4 w-4 accent-brand"
                  />
                  Needs review
                </label>
              </Field>
            </div>
          </section>

          <section className="rounded-card border border-navy/15 bg-white p-4">
            <h2 className={`${label} mb-4 text-navy/55`}>Question</h2>
            <div className="flex flex-col gap-4">
              <Field labelText="Passage / stimulus (optional)">
                <UnderlineTextarea
                  value={draft.passage}
                  onChange={(value) => patch({ passage: value })}
                  rows={5}
                  placeholder="Reading passage or Math context. Leave blank if none."
                />
              </Field>

              <Field labelText="Prompt">
                <textarea
                  value={draft.prompt}
                  onChange={(e) => patch({ prompt: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-y`}
                  placeholder="The question stem."
                />
              </Field>

              <FigureUploadField
                value={draft.figureUrl}
                onChange={(figureUrl) => patch({ figureUrl })}
              />
            </div>
          </section>

          {draft.type === "mc" ? (
            <section className="rounded-card border border-navy/15 bg-white p-4">
              <h2 className={`${label} mb-1 text-navy/55`}>Choices</h2>
              <p className="mb-4 text-[13px] text-navy/50">
                Select the radio to mark the correct answer. Press Enter inside a choice to add another line.
              </p>
              <div className="flex flex-col gap-4">
                {draft.choices.map((c) => (
                  <div key={c.letter} className="rounded-[10px] border border-navy/12 p-3">
                    <div className="flex items-start gap-3">
                      <label className="flex min-h-11 flex-none cursor-pointer items-center gap-2 font-display text-sm font-bold text-navy">
                        <input
                          type="radio"
                          name="correct"
                          checked={draft.correct === c.letter}
                          onChange={() => patch({ correct: c.letter })}
                          className="h-4 w-4 accent-brand"
                        />
                        {c.letter}
                      </label>
                      <textarea
                        value={c.text}
                        onChange={(e) => patchChoice(c.letter, { text: e.target.value })}
                        rows={2}
                        aria-label={`Choice ${c.letter} text`}
                        className={`${inputClass} min-h-[68px] resize-y leading-6`}
                        placeholder={`Choice ${c.letter} text. Press Enter for another line.`}
                      />
                    </div>
                    <textarea
                      value={c.explanation ?? ""}
                      onChange={(e) => patchChoice(c.letter, { explanation: e.target.value })}
                      rows={2}
                      className={`${inputClass} mt-2 resize-y text-[13px]`}
                      placeholder={`Why ${c.letter} is right / wrong (optional)`}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-card border border-navy/15 bg-white p-4">
              <h2 className={`${label} mb-1 text-navy/55`}>Accepted answers</h2>
              <p className="mb-3 text-[13px] text-navy/50">One accepted answer per line (e.g. 1.5 and 3/2 as two lines).</p>
              <textarea
                value={draft.acceptedText}
                onChange={(e) => patch({ acceptedText: e.target.value })}
                rows={4}
                className={`${inputClass} resize-y font-mono text-[13px]`}
                placeholder={"28\n28.0"}
              />
            </section>
          )}

          <section className="rounded-card border border-navy/15 bg-white p-4">
            <h2 className={`${label} mb-4 text-navy/55`}>Explanation</h2>
            <textarea
              value={draft.explanation}
              onChange={(e) => patch({ explanation: e.target.value })}
              rows={4}
              className={`${inputClass} resize-y`}
              placeholder="Why the correct answer is correct (shown on the results review)."
            />
          </section>
        </div>

        {/* ---- Live preview ---- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Preview draft={draft} />
        </aside>
      </div>

      <footer className="sticky bottom-0 z-30 -mx-6 flex flex-wrap items-center gap-3 border-t border-navy/12 bg-white/[0.92] px-6 py-3 backdrop-blur-md">
        {error ? <span className="text-[12px] font-medium text-danger">{error}</span> : null}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className={`${secondaryBtn} border-danger/30 text-danger hover:bg-danger-bg`}
        >
          {saving === "deleting" ? "Deleting…" : "Delete"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onSave} disabled={busy || !dirty} className={primaryBtn}>
            {saving === "saving" ? "Saving…" : "Save changes"}
          </button>
          <NextButton href={nextQuestionHref} busy={busy} onNavigate={navigateTo} />
        </div>
      </footer>
    </div>
  );
}

function NextButton({
  href,
  busy,
  onNavigate,
}: {
  href: string | null;
  busy: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => href && onNavigate(href)}
      disabled={busy || !href}
      title={href ? "Open the next question" : "This is the last question in the test"}
      className={`${secondaryBtn} min-h-11 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`}
    >
      Next
      <ChevronRightIcon className="h-3.5 w-3.5" />
    </button>
  );
}

// Bluebook-flavored preview using the same renderers as the live test.
function Preview({ draft }: { draft: Draft }) {
  return (
    <div className="rounded-card border border-navy/15 bg-white p-5">
      <h2 className={`${label} mb-3 text-navy/55`}>Preview</h2>

      {draft.passage.trim() ? (
        <QuestionContent
          text={draft.passage}
          pClassName="mb-3 whitespace-pre-line border-l-2 border-ice-200 pl-3 text-sm leading-6 text-exam-muted"
        />
      ) : null}

      {draft.figureUrl.trim() ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.figureUrl} alt="Figure" className="mb-3 max-h-56 w-auto rounded-md border border-navy/10" />
      ) : null}

      <p className="text-[15px] font-medium leading-7 text-ink">
        {draft.prompt.trim() ? <MathText>{draft.prompt}</MathText> : <span className="text-navy/35">No prompt yet</span>}
      </p>

      {draft.type === "mc" ? (
        <ul className="mt-4 flex flex-col gap-2">
          {draft.choices.map((c) => {
            const correct = draft.correct === c.letter;
            return (
              <li
                key={c.letter}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  correct ? "border-success-600/40 bg-success-bg text-success-600" : "border-navy/12 text-ink"
                }`}
              >
                <span className="font-display font-bold">{c.letter}.</span>
                <span className="min-w-0 whitespace-pre-line">
                  {c.text.trim() ? <MathText>{c.text}</MathText> : <span className="text-navy/35">—</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-lg bg-ice/60 px-3 py-2 text-sm text-ink">
          <span className="text-xs uppercase tracking-wide text-navy/45">Accepted</span>
          <div className="mt-0.5">
            {draft.acceptedText.trim()
              ? draft.acceptedText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .join("  ·  ")
              : "—"}
          </div>
        </div>
      )}

      {draft.explanation.trim() ? (
        <p className="mt-4 border-t border-navy/10 pt-3 text-sm leading-6 text-ink">
          <span className="font-semibold">Why: </span>
          <MathText>{draft.explanation}</MathText>
        </p>
      ) : null}
    </div>
  );
}

function UnderlineTextarea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function underlineSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const openTag = "<u>";
    const closeTag = "</u>";
    const nextValue =
      value.slice(0, start) +
      openTag +
      value.slice(start, end) +
      closeTag +
      value.slice(end);

    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + openTag.length, end + openTag.length);
    });
  }

  return (
    <div className="overflow-hidden rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-navy/10 bg-mist/60 px-2 py-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={underlineSelection}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-navy transition-colors hover:bg-navy/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title="Underline selected text"
        >
          <UnderlineIcon className="h-4 w-4" />
          Underline
        </button>
        <span className="text-[11px] text-navy/45">
          Select text, then click Underline. Safe &lt;u&gt;…&lt;/u&gt; markup also works.
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-y bg-white px-[13px] py-2.5 text-sm text-ink outline-none placeholder:text-navy/35"
        placeholder={placeholder}
      />
    </div>
  );
}

function Field({
  labelText,
  hint,
  className,
  children,
}: {
  labelText: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className={`${label} mb-1.5 block text-navy/55`}>{labelText}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-snug text-navy/45">{hint}</span> : null}
    </div>
  );
}

const selectClass =
  "w-full appearance-none rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
