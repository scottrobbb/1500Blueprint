"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { normalizeCoursePracticeAnswer } from "@/lib/courses/practice";
import type { CoursePractice, CoursePracticeQuestion } from "@/lib/courses/types";

type Grade = { score: number; correctCount: number; questionCount: number; passed: boolean; results: Record<string, boolean> };

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function CoursePracticeRunner({ lessonId, blockId, practice }: { lessonId: string; blockId: string; practice: CoursePractice }) {
  const [questions, setQuestions] = useState<CoursePracticeQuestion[]>(() => practice.randomizeQuestions ? shuffled(practice.questions) : practice.questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const question = questions[currentIndex];
  const answer = question ? answers[question.id] ?? "" : "";
  const locallyCorrect = question ? normalizeCoursePracticeAnswer(answer) === normalizeCoursePracticeAnswer(question.correctAnswer) : false;

  function setAnswer(value: string) {
    if (checked || !question) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  async function finish() {
    setSaving(true);
    setSaveError(false);
    const response = await fetch("/api/courses/practice-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId, blockId, answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, answer: value })) }),
    });
    const result = (await response.json().catch(() => null)) as Grade | null;
    setSaving(false);
    if (response.ok && result) setGrade(result);
    else setSaveError(true);
  }

  async function nextQuestion() {
    if (currentIndex === questions.length - 1) await finish();
    else { setCurrentIndex((index) => index + 1); setChecked(false); }
  }

  function retry() {
    setQuestions(practice.randomizeQuestions ? shuffled(practice.questions) : practice.questions);
    setCurrentIndex(0);
    setAnswers({});
    setChecked(false);
    setGrade(null);
    setSaveError(false);
  }

  if (grade) {
    return (
      <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_18px_45px_-34px_rgba(12,35,72,0.55)]">
        <div className={`px-5 py-6 sm:px-7 ${grade.passed ? "bg-success-bg" : "bg-[#fff8e4]"}`}>
          <p className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${grade.passed ? "text-success-600" : "text-[#8a6500]"}`}>{grade.passed ? "Practice mastered" : "Keep working"}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-display text-2xl font-extrabold text-navy">{practice.title}</h2><p className="mt-1 text-sm text-navy/55">{grade.correctCount} of {grade.questionCount} correct</p></div><strong className="font-display text-4xl font-extrabold text-navy">{grade.score}%</strong></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7"><p className="text-sm text-navy/55">Passing score: {practice.passingScore}%</p><button type="button" onClick={retry} className="min-h-11 cursor-pointer rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Try again</button></div>
      </section>
    );
  }

  if (!question) return <p className="rounded-2xl border border-gold/35 bg-[#fff9e9] p-5 text-sm font-semibold text-[#745700]">This practice does not have any published questions yet.</p>;

  return (
    <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_18px_45px_-34px_rgba(12,35,72,0.55)]">
      <header className="border-b border-navy/10 bg-haze/55 px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Course practice</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">{practice.title}</h2></div><span className="rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-bold text-navy/55">{currentIndex + 1} / {questions.length}</span></div>
        {currentIndex === 0 && practice.instructions ? <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/50">{practice.instructions}</p> : null}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]"><div className="h-full rounded-full bg-brand transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
      </header>
      <div className="px-5 py-6 sm:px-7 sm:py-7">
        <p className="max-w-[72ch] whitespace-pre-wrap text-base font-semibold leading-7 text-ink sm:text-lg">{question.prompt}</p>
        {question.imageUrl ? <img src={question.imageUrl} alt="Question figure" className="mt-5 max-h-[420px] w-auto max-w-full rounded-2xl border border-navy/10 object-contain" /> : null}
        {question.type === "multiple_choice" ? (
          <div className="mt-6 grid gap-3">
            {question.choices.map((choice, choiceIndex) => {
              const selected = answer === choice;
              const correctChoice = checked && normalizeCoursePracticeAnswer(choice) === normalizeCoursePracticeAnswer(question.correctAnswer);
              const wrongChoice = checked && selected && !correctChoice;
              return <button key={`${choiceIndex}-${choice}`} type="button" onClick={() => setAnswer(choice)} disabled={checked} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default ${correctChoice ? "border-success bg-success-bg text-success-600" : wrongChoice ? "border-danger/55 bg-danger-bg text-danger-600" : selected ? "border-brand bg-ice text-navy" : "border-navy/15 bg-white text-navy hover:border-brand/40 hover:bg-ice/45"}`}><span className={`grid h-8 w-8 flex-none place-items-center rounded-full border text-xs font-extrabold ${selected ? "border-current bg-white/70" : "border-navy/15 bg-haze"}`}>{String.fromCharCode(65 + choiceIndex)}</span><span>{choice || `Choice ${choiceIndex + 1}`}</span></button>;
            })}
          </div>
        ) : (
          <label className="mt-6 block"><span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-navy/45">Your answer</span><input value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={checked} className="mt-2 min-h-14 w-full rounded-2xl border border-navy/20 bg-white px-4 text-base font-semibold text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-haze" /></label>
        )}
        {checked ? <div role="status" className={`mt-5 rounded-2xl border px-4 py-4 ${locallyCorrect ? "border-success/25 bg-success-bg" : "border-danger/25 bg-danger-bg"}`}><strong className={`block text-sm ${locallyCorrect ? "text-success-600" : "text-danger-600"}`}>{locallyCorrect ? "Correct" : `Correct answer: ${question.correctAnswer}`}</strong><p className="mt-1.5 text-sm leading-6 text-navy/65">{question.explanation}</p></div> : null}
        {saveError ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">Your score could not be saved. Try finishing again.</p> : null}
        <div className="mt-6 flex justify-end"><button type="button" disabled={!answer.trim() || saving} onClick={checked ? nextQuestion : () => setChecked(true)} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : checked ? currentIndex === questions.length - 1 ? "Finish practice" : "Next question" : "Check answer"}</button></div>
      </div>
    </section>
  );
}
