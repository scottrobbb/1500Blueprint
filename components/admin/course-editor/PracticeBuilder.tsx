"use client";

import { useState } from "react";
import { MathText } from "@/components/test/MathText";
import { emptyCoursePracticeQuestion, isCoursePracticeQuestionComplete } from "@/lib/courses/practice";
import type { CoursePractice, CoursePracticeQuestion, CoursePracticeQuestionType } from "@/lib/courses/types";
import { createClient } from "@/utils/supabase/client";
import { renderPracticeExplanation } from "@/components/ultimate/courses/practiceContent";
import { CourseAssetUpload } from "./CourseAssetUpload";

async function uploadPastedImage(file: File): Promise<string | null> {
  const response = await fetch("/api/admin/courses/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name || `pasted-${Date.now()}.png`, type: file.type, size: file.size }),
  });
  const signed = (await response.json().catch(() => null)) as { path?: string; token?: string; url?: string; error?: string } | null;
  if (!response.ok || !signed?.path || !signed.token || !signed.url) return null;
  const uploaded = await createClient().storage.from("course-assets").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, cacheControl: "31536000" });
  if (uploaded.error) return null;
  return signed.url;
}

const inputClass = "mt-1.5 w-full rounded-xl border border-navy/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass = "text-[10px] font-extrabold uppercase tracking-[0.11em] text-navy/45";

function appendExplanationLine(explanation: string, line: string): string {
  return explanation.trim() ? `${explanation}\n${line}` : line;
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function PracticeBuilder({ value, onChange }: { value: CoursePractice; onChange: (practice: CoursePractice) => void }) {
  const [explanationPastingId, setExplanationPastingId] = useState<string | null>(null);
  const [explanationPasteErrorId, setExplanationPasteErrorId] = useState<string | null>(null);
  const [imagePastingId, setImagePastingId] = useState<string | null>(null);
  const [imagePasteErrorId, setImagePasteErrorId] = useState<string | null>(null);
  // Tracks which questions are expanded, independent of completeness, so
  // typing a valid answer never auto-collapses the question mid-edit.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(value.questions.filter((question, index) => index === 0 || !isCoursePracticeQuestionComplete(question)).map((question) => question.id)));

  function setQuestionOpen(questionId: string, open: boolean) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(questionId); else next.delete(questionId);
      return next;
    });
  }

  function updateQuestion(questionIndex: number, update: Partial<CoursePracticeQuestion>) {
    onChange({ ...value, questions: value.questions.map((question, index) => index === questionIndex ? { ...question, ...update } : question) });
  }

  async function handleExplanationPaste(event: React.ClipboardEvent<HTMLTextAreaElement>, questionIndex: number, question: CoursePracticeQuestion) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const cursor = event.currentTarget.selectionStart;
    setExplanationPastingId(question.id);
    setExplanationPasteErrorId(null);
    const url = await uploadPastedImage(file);
    setExplanationPastingId(null);
    if (!url) { setExplanationPasteErrorId(question.id); return; }
    const before = question.explanation.slice(0, cursor);
    const after = question.explanation.slice(cursor);
    updateQuestion(questionIndex, { explanation: `${before}\n![](${url})\n${after}` });
  }

  async function handleImageUrlPaste(event: React.ClipboardEvent<HTMLInputElement>, questionIndex: number, question: CoursePracticeQuestion) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    setImagePastingId(question.id);
    setImagePasteErrorId(null);
    const url = await uploadPastedImage(file);
    setImagePastingId(null);
    if (!url) { setImagePasteErrorId(question.id); return; }
    updateQuestion(questionIndex, { imageUrl: url });
  }

  function addQuestion(type: CoursePracticeQuestionType) {
    const question = emptyCoursePracticeQuestion(type);
    setQuestionOpen(question.id, true);
    onChange({ ...value, questions: [...value.questions, question] });
  }

  const completeCount = value.questions.filter(isCoursePracticeQuestionComplete).length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand/20 bg-ice/55 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Native practice runner</p><h4 className="mt-1 font-display text-lg font-extrabold text-navy">Practice settings</h4></div><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${completeCount === value.questions.length && value.questions.length > 0 ? "bg-success-bg text-success-600" : "bg-white text-navy/45"}`}>{completeCount}/{value.questions.length} questions ready</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Practice title"><input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} className={inputClass} /></Field>
          <Field label="Passing score"><div className="relative"><input type="number" min="0" max="100" value={value.passingScore} onChange={(event) => onChange({ ...value, passingScore: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className={`${inputClass} pr-9`} /><span className="pointer-events-none absolute bottom-2.5 right-3 text-sm font-bold text-navy/35">%</span></div></Field>
          <div className="sm:col-span-2"><Field label="Student instructions"><textarea rows={2} value={value.instructions} onChange={(event) => onChange({ ...value, instructions: event.target.value })} className={inputClass} /></Field></div>
        </div>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-navy/10 bg-white px-3.5 text-sm font-semibold text-navy/65"><input type="checkbox" checked={value.randomizeQuestions} onChange={(event) => onChange({ ...value, randomizeQuestions: event.target.checked })} className="h-4 w-4 accent-[#35a7f2]" />Randomize question order on every attempt</label>
      </div>

      <div className="space-y-3">
        {value.questions.map((question, questionIndex) => {
          const complete = isCoursePracticeQuestionComplete(question);
          return (
            <details key={question.id} open={openIds.has(question.id)} onToggle={(event) => setQuestionOpen(question.id, event.currentTarget.open)} className="group overflow-hidden rounded-2xl border border-navy/10 bg-white">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 bg-haze/45 px-3 py-2 sm:px-4"><span className={`grid h-8 w-8 flex-none place-items-center rounded-xl text-xs font-extrabold ${complete ? "bg-success-bg text-success-600" : "bg-[#fff4d5] text-[#8a6500]"}`}>{questionIndex + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-navy">{question.prompt || "Untitled question"}</strong><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-navy/35">{question.type === "multiple_choice" ? "Multiple choice" : "Free response"} · {complete ? "Ready" : "Needs attention"}</span></span><OrderButtons onUp={(event) => { event.preventDefault(); onChange({ ...value, questions: move(value.questions, questionIndex, -1) }); }} onDown={(event) => { event.preventDefault(); onChange({ ...value, questions: move(value.questions, questionIndex, 1) }); }} /></summary>
              <div className="border-t border-navy/10 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]"><Field label="Question type"><select value={question.type} onChange={(event) => { const type = event.target.value as CoursePracticeQuestionType; updateQuestion(questionIndex, { type, choices: type === "multiple_choice" && question.choices.length < 2 ? ["", "", "", ""] : type === "free_response" ? [] : question.choices, correctAnswer: "" }); }} className={inputClass}><option value="multiple_choice">Multiple choice</option><option value="free_response">Free response</option></select></Field><Field label="Question prompt"><textarea rows={3} value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="Supports LaTeX, e.g. $x^2 + 3x = 0$" className={inputClass} />{question.prompt.trim() ? <div className="mt-1.5 rounded-lg border border-navy/10 bg-haze/40 px-3 py-2 text-sm text-ink"><MathText>{question.prompt}</MathText></div> : null}</Field></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Optional image URL"><input type="url" value={question.imageUrl ?? ""} onChange={(event) => updateQuestion(questionIndex, { imageUrl: event.target.value })} onPaste={(event) => void handleImageUrlPaste(event, questionIndex, question)} placeholder="https://… or paste an image" className={inputClass} /><CourseAssetUpload kind="image" compact onUploaded={(url) => updateQuestion(questionIndex, { imageUrl: url })} />{imagePastingId === question.id ? <p className="mt-1.5 text-xs font-semibold text-brand-700">Uploading pasted image…</p> : null}{imagePasteErrorId === question.id ? <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-600">That image could not be uploaded.</p> : null}</Field><Field label="Answer explanation"><textarea rows={4} value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} onPaste={(event) => void handleExplanationPaste(event, questionIndex, question)} placeholder="Explain why the answer is correct and the trap to avoid. Supports LaTeX; paste an image to drop it in." className={inputClass} /><CourseAssetUpload kind="audio" compact onUploaded={(url) => updateQuestion(questionIndex, { explanation: appendExplanationLine(question.explanation, `[[audio:${url}]]`) })} />{explanationPastingId === question.id ? <p className="mt-1.5 text-xs font-semibold text-brand-700">Uploading pasted image…</p> : null}{explanationPasteErrorId === question.id ? <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-600">That image could not be uploaded.</p> : null}{question.explanation.trim() ? <div className="mt-1.5 rounded-lg border border-navy/10 bg-haze/40 px-3 py-2 text-sm text-ink">{renderPracticeExplanation(question.explanation)}</div> : null}</Field></div>
                {question.type === "multiple_choice" ? <ChoiceEditor question={question} onChange={(update) => updateQuestion(questionIndex, update)} /> : <div className="mt-4"><Field label="Accepted answer"><input value={question.correctAnswer} onChange={(event) => updateQuestion(questionIndex, { correctAnswer: event.target.value })} placeholder="Exact answer; capitalization and extra spaces are ignored" className={inputClass} /></Field><AcceptedAnswersEditor question={question} onChange={(update) => updateQuestion(questionIndex, update)} /></div>}
                <div className="mt-4 flex justify-end"><button type="button" onClick={() => onChange({ ...value, questions: value.questions.filter((_, index) => index !== questionIndex) })} className="min-h-10 cursor-pointer rounded-xl px-3 text-xs font-extrabold text-danger-600 transition-colors hover:bg-danger-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger">Delete question</button></div>
              </div>
            </details>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => addQuestion("multiple_choice")} className="min-h-11 cursor-pointer rounded-xl border border-dashed border-brand/35 bg-ice/45 text-sm font-extrabold text-brand-700 transition-colors hover:bg-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">+ Multiple-choice question</button><button type="button" onClick={() => addQuestion("free_response")} className="min-h-11 cursor-pointer rounded-xl border border-dashed border-brand/35 bg-ice/45 text-sm font-extrabold text-brand-700 transition-colors hover:bg-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">+ Free-response question</button></div>
    </div>
  );
}

function ChoiceEditor({ question, onChange }: { question: CoursePracticeQuestion; onChange: (update: Partial<CoursePracticeQuestion>) => void }) {
  function updateChoice(choiceIndex: number, nextValue: string) {
    const previous = question.choices[choiceIndex];
    const choices = question.choices.map((choice, index) => index === choiceIndex ? nextValue : choice);
    onChange({ choices, correctAnswer: question.correctAnswer === previous ? nextValue : question.correctAnswer });
  }
  return (
    <fieldset className="mt-4 rounded-2xl border border-navy/10 bg-haze/35 p-3 sm:p-4"><legend className="px-1 text-[10px] font-extrabold uppercase tracking-[0.11em] text-navy/45">Answer choices · select the correct one · supports LaTeX</legend><div className="mt-2 space-y-2">{question.choices.map((choice, choiceIndex) => <div key={choiceIndex} className="space-y-1"><div className="flex items-center gap-2"><label className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-xl border border-navy/10 bg-white" title="Mark as correct"><input type="radio" name={`correct-${question.id}`} checked={Boolean(choice) && question.correctAnswer === choice} onChange={() => onChange({ correctAnswer: choice })} className="h-4 w-4 accent-[#35a7f2]" aria-label={`Mark choice ${choiceIndex + 1} correct`} /></label><input value={choice} onChange={(event) => updateChoice(choiceIndex, event.target.value)} placeholder={`Choice ${String.fromCharCode(65 + choiceIndex)}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15" /><button type="button" aria-label={`Delete choice ${choiceIndex + 1}`} disabled={question.choices.length <= 2} onClick={() => onChange({ choices: question.choices.filter((_, index) => index !== choiceIndex), correctAnswer: question.correctAnswer === choice ? "" : question.correctAnswer })} className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-xl text-lg text-danger-600 transition-colors hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-25">×</button></div>{choice.trim() ? <div className="rounded-lg border border-navy/10 bg-white px-3 py-1.5 text-sm text-ink"><MathText>{choice}</MathText></div> : null}</div>)}</div><button type="button" onClick={() => onChange({ choices: [...question.choices, ""] })} className="mt-3 min-h-10 cursor-pointer rounded-xl border border-navy/10 bg-white px-3 text-xs font-extrabold text-navy/55 transition-colors hover:border-brand/30 hover:text-brand-700">+ Add choice</button></fieldset>
  );
}

function AcceptedAnswersEditor({ question, onChange }: { question: CoursePracticeQuestion; onChange: (update: Partial<CoursePracticeQuestion>) => void }) {
  const acceptedAnswers = question.acceptedAnswers ?? [];
  function updateAlternate(index: number, nextValue: string) {
    onChange({ acceptedAnswers: acceptedAnswers.map((answer, i) => i === index ? nextValue : answer) });
  }
  return (
    <div className="mt-3">
      <span className={labelClass}>Alternate accepted forms (optional)</span>
      <p className="mt-1 text-xs text-navy/45">Add other forms that also count as correct, e.g. a fraction and its decimal equivalent.</p>
      <div className="mt-2 space-y-2">
        {acceptedAnswers.map((answer, index) => (
          <div key={index} className="flex items-center gap-2">
            <input value={answer} onChange={(event) => updateAlternate(index, event.target.value)} placeholder="e.g. 0.5" className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15" />
            <button type="button" aria-label={`Delete alternate answer ${index + 1}`} onClick={() => onChange({ acceptedAnswers: acceptedAnswers.filter((_, i) => i !== index) })} className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-xl text-lg text-danger-600 transition-colors hover:bg-danger-bg">×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ acceptedAnswers: [...acceptedAnswers, ""] })} className="mt-2 min-h-10 cursor-pointer rounded-xl border border-navy/10 bg-white px-3 text-xs font-extrabold text-navy/55 transition-colors hover:border-brand/30 hover:text-brand-700">+ Add alternate answer</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }
function OrderButtons({ onUp, onDown }: { onUp: (event: React.MouseEvent<HTMLButtonElement>) => void; onDown: (event: React.MouseEvent<HTMLButtonElement>) => void }) { return <span className="inline-flex overflow-hidden rounded-lg border border-navy/10 bg-white"><button type="button" aria-label="Move up" onClick={onUp} className="grid h-9 w-9 cursor-pointer place-items-center text-navy/50 transition-colors hover:bg-ice hover:text-brand-700">↑</button><button type="button" aria-label="Move down" onClick={onDown} className="grid h-9 w-9 cursor-pointer place-items-center border-l border-navy/10 text-navy/50 transition-colors hover:bg-ice hover:text-brand-700">↓</button></span>; }
