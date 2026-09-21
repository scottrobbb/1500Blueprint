"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { MathText } from "@/components/test/MathText";
import { coursePracticeAnswerMap, isCheckboxChoiceCorrect, isCoursePracticeAnswerCorrect, normalizeCoursePracticeAnswer, parseCheckboxAnswer, serializeCheckboxAnswer, type SavedCoursePracticeAttempt } from "@/lib/courses/practice";
import type { CoursePractice, CoursePracticeQuestion } from "@/lib/courses/types";
import { renderPracticeExplanation } from "./practiceContent";

type Grade = { score: number; correctCount: number; questionCount: number; passed: boolean; results: Record<string, boolean>; completedAt?: string; attemptCount?: number; bestScore?: number };

// One finished question, read only: what the student picked, what was correct,
// and the explanation. Separate from the runner's own question view so review
// can never submit an answer or advance the attempt.
function ReviewQuestion({ question, index, given }: { question: CoursePracticeQuestion; index: number; given: string }) {
  const answered = given.trim().length > 0;
  const correct = answered && isCoursePracticeAnswerCorrect(question, given);
  const selectedChoices = question.type === "checkbox" ? parseCheckboxAnswer(given) : [given];
  const correctText = question.type === "checkbox"
    ? parseCheckboxAnswer(question.correctAnswer).join(", ")
    : [question.correctAnswer, ...(question.acceptedAnswers ?? []).filter(Boolean)].join(" or ");

  return (
    <article className="rounded-2xl border border-navy/12 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-navy/55">Question {index + 1}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${!answered ? "bg-haze text-navy/50" : correct ? "bg-success-bg text-success-600" : "bg-danger-bg text-danger-600"}`}>{!answered ? "Not answered" : correct ? "Correct" : "Incorrect"}</span>
      </div>
      {question.prompt ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap text-base font-semibold leading-7 text-ink"><MathText>{question.prompt}</MathText></p> : null}
      {question.imageUrl ? <img src={question.imageUrl} alt="Question figure" width={1200} height={800} className="mt-4 h-auto max-h-[420px] w-auto max-w-full rounded-2xl border border-navy/10 object-contain" /> : null}
      {question.type === "multiple_choice" || question.type === "checkbox" ? (
        <ul className="mt-4 grid gap-2">
          {question.choices.map((choice, choiceIndex) => {
            const chosen = selectedChoices.some((value) => normalizeCoursePracticeAnswer(value) === normalizeCoursePracticeAnswer(choice));
            const correctChoice = question.type === "checkbox"
              ? isCheckboxChoiceCorrect(question, choice)
              : normalizeCoursePracticeAnswer(choice) === normalizeCoursePracticeAnswer(question.correctAnswer);
            return (
              <li key={`${choiceIndex}-${choice}`} className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-semibold ${correctChoice ? "border-success bg-success-bg text-success-600" : chosen ? "border-danger/55 bg-danger-bg text-danger-600" : "border-navy/12 bg-white text-navy/70"}`}>
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-current text-xs font-extrabold">{String.fromCharCode(65 + choiceIndex)}</span>
                <span>{choice ? <MathText>{choice}</MathText> : `Choice ${choiceIndex + 1}`}</span>
                {chosen ? <span className="ml-auto text-xs font-extrabold">Your answer</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex flex-wrap gap-x-2"><dt className="font-extrabold text-navy/55">Your answer:</dt><dd className={`font-semibold ${!answered ? "text-navy/45" : correct ? "text-success-600" : "text-danger-600"}`}>{answered ? given : "Left blank"}</dd></div>
          <div className="flex flex-wrap gap-x-2"><dt className="font-extrabold text-navy/55">Correct answer:</dt><dd className="font-semibold text-navy">{correctText}</dd></div>
        </dl>
      )}
      {question.explanation ? <div className="mt-4 rounded-2xl bg-haze px-4 py-3 text-sm leading-6 text-navy/65">{renderPracticeExplanation(question.explanation)}</div> : null}
    </article>
  );
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function CoursePracticeRunner({
  lessonId,
  blockId,
  practice,
  initialAttempt,
}: {
  lessonId: string;
  blockId: string;
  practice: CoursePractice;
  initialAttempt?: SavedCoursePracticeAttempt;
}) {
  const [questions, setQuestions] = useState<CoursePracticeQuestion[]>(() => practice.randomizeQuestions ? shuffled(practice.questions) : practice.questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(() => initialAttempt ? { ...initialAttempt, results: {} } : null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const question = questions[currentIndex];
  const answer = question ? answers[question.id] ?? "" : "";
  const locallyCorrect = question ? isCoursePracticeAnswerCorrect(question, answer) : false;

  function setAnswer(value: string) {
    if (checked || !question) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  function toggleAnswerChoice(choice: string) {
    if (checked || !question) return;
    const selected = parseCheckboxAnswer(answer);
    const next = selected.includes(choice) ? selected.filter((value) => value !== choice) : [...selected, choice];
    setAnswer(serializeCheckboxAnswer(next));
  }

  async function finish() {
    setSaving(true);
    setSaveError(false);
    const attemptToken = clientToken ?? crypto.randomUUID();
    if (!clientToken) setClientToken(attemptToken);
    try {
      const response = await fetch("/api/courses/practice-attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, blockId, clientToken: attemptToken, answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, answer: value })) }),
      });
      const result = (await response.json().catch(() => null)) as Grade | null;
      if (!response.ok || !result) throw new Error("save_failed");
      setGrade(result);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
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
    setClientToken(null);
    setReviewing(false);
  }

  // This session's answers when the practice was just finished, and the saved
  // ones when the result was restored on a later visit. A saved attempt from
  // before answers were read back leaves this empty: the review then shows the
  // questions and their explanations without marking what was picked.
  const reviewAnswers = Object.keys(answers).length > 0 ? answers : coursePracticeAnswerMap(initialAttempt?.answers ?? []);

  if (grade && reviewing) {
    return (
      <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_18px_45px_-34px_rgba(12,35,72,0.55)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/10 bg-haze/55 px-5 py-4 sm:px-7">
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">{practice.title}</h2>
            <p className="mt-1 text-sm text-navy/55">Reviewing your answers · {grade.correctCount} of {grade.questionCount} correct</p>
          </div>
          <button type="button" onClick={() => setReviewing(false)} className="min-h-11 cursor-pointer rounded-xl border border-navy/15 bg-white px-5 text-sm font-extrabold text-navy transition-colors hover:border-navy/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Back to result</button>
        </header>
        <div className="grid gap-5 px-5 py-6 sm:px-7 sm:py-7">
          {questions.map((reviewQuestion, reviewIndex) => (
            <ReviewQuestion key={reviewQuestion.id} question={reviewQuestion} index={reviewIndex} given={reviewAnswers[reviewQuestion.id] ?? ""} />
          ))}
        </div>
      </section>
    );
  }

  if (grade) {
    return (
      <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_18px_45px_-34px_rgba(12,35,72,0.55)]">
        <div className={`px-5 py-6 sm:px-7 ${grade.passed ? "bg-success-bg" : "bg-flag-bg"}`}>
          <p className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${grade.passed ? "text-success-600" : "text-flag"}`}>{grade.completedAt ? "Saved practice result" : grade.passed ? "Practice mastered" : "Keep working"}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-display text-2xl font-extrabold text-navy">{practice.title}</h2><p className="mt-1 text-sm text-navy/55">{grade.correctCount} of {grade.questionCount} correct</p></div><strong className="font-display text-4xl font-extrabold text-navy">{grade.score}%</strong></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7"><p className="text-sm text-navy/55">{grade.attemptCount ? `${grade.attemptCount} saved ${grade.attemptCount === 1 ? "attempt" : "attempts"} · Best ${grade.bestScore}%` : `Passing score: ${practice.passingScore}%`}</p><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setReviewing(true)} className="min-h-11 cursor-pointer rounded-xl border border-navy/15 bg-white px-5 text-sm font-extrabold text-navy transition-colors hover:border-navy/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Review questions</button><button type="button" onClick={retry} className="min-h-11 cursor-pointer rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Try again</button></div></div>
      </section>
    );
  }

  if (!question) return <p className="rounded-2xl border border-gold/35 bg-flag-bg p-5 text-sm font-semibold text-flag">This practice does not have any published questions yet.</p>;

  return (
    <section className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_18px_45px_-34px_rgba(12,35,72,0.55)]">
      <header className="border-b border-navy/10 bg-haze/55 px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Course practice</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">{practice.title}</h2></div><span className="rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-bold text-navy/55">{currentIndex + 1} / {questions.length}</span></div>
        {currentIndex === 0 && practice.instructions ? <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/50">{practice.instructions}</p> : null}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]"><div className="h-full rounded-full bg-brand transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
      </header>
      <div className="px-5 py-6 sm:px-7 sm:py-7">
        {question.prompt ? <p className="max-w-[72ch] whitespace-pre-wrap text-base font-semibold leading-7 text-ink sm:text-lg"><MathText>{question.prompt}</MathText></p> : null}
        {question.imageUrl ? <img src={question.imageUrl} alt="Question figure" width={1200} height={800} className="mt-5 h-auto max-h-[420px] w-auto max-w-full rounded-2xl border border-navy/10 object-contain" /> : null}
        {question.type === "multiple_choice" ? (
          <div className="mt-6 grid gap-3">
            {question.choices.map((choice, choiceIndex) => {
              const selected = answer === choice;
              const correctChoice = checked && normalizeCoursePracticeAnswer(choice) === normalizeCoursePracticeAnswer(question.correctAnswer);
              const wrongChoice = checked && selected && !correctChoice;
              return <button key={`${choiceIndex}-${choice}`} type="button" onClick={() => setAnswer(choice)} disabled={checked} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default ${correctChoice ? "border-success bg-success-bg text-success-600" : wrongChoice ? "border-danger/55 bg-danger-bg text-danger-600" : selected ? "border-brand bg-ice text-navy" : "border-navy/15 bg-white text-navy hover:border-brand/40 hover:bg-ice/45"}`}><span className={`grid h-8 w-8 flex-none place-items-center rounded-full border text-xs font-extrabold ${selected ? "border-current bg-white/70" : "border-navy/15 bg-haze"}`}>{String.fromCharCode(65 + choiceIndex)}</span><span>{choice ? <MathText>{choice}</MathText> : `Choice ${choiceIndex + 1}`}</span></button>;
            })}
          </div>
        ) : question.type === "checkbox" ? (
          <div className="mt-6 grid gap-3">
            {question.choices.map((choice, choiceIndex) => {
              const selected = parseCheckboxAnswer(answer).includes(choice);
              const correctChoice = checked && isCheckboxChoiceCorrect(question, choice);
              const wrongChoice = checked && selected && !correctChoice;
              return <button key={`${choiceIndex}-${choice}`} type="button" onClick={() => toggleAnswerChoice(choice)} disabled={checked} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default ${correctChoice ? "border-success bg-success-bg text-success-600" : wrongChoice ? "border-danger/55 bg-danger-bg text-danger-600" : selected ? "border-brand bg-ice text-navy" : "border-navy/15 bg-white text-navy hover:border-brand/40 hover:bg-ice/45"}`}><span className={`grid h-8 w-8 flex-none place-items-center rounded-md border text-xs font-extrabold ${selected ? "border-current bg-white/70" : "border-navy/15 bg-haze"}`} aria-hidden="true">{selected ? "✓" : ""}</span><span>{choice ? <MathText>{choice}</MathText> : `Choice ${choiceIndex + 1}`}</span></button>;
            })}
          </div>
        ) : (
          <label className="mt-6 block"><span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-navy/45">Your answer</span><input value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={checked} className="mt-2 min-h-14 w-full rounded-2xl border border-navy/20 bg-white px-4 text-base font-semibold text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-haze" /></label>
        )}
        {checked ? <div role="status" className={`mt-5 rounded-2xl border px-4 py-4 ${locallyCorrect ? "border-success/25 bg-success-bg" : "border-danger/25 bg-danger-bg"}`}><strong className={`block text-sm ${locallyCorrect ? "text-success-600" : "text-danger-600"}`}>{locallyCorrect ? "Correct" : `Correct answer: ${question.type === "checkbox" ? parseCheckboxAnswer(question.correctAnswer).join(", ") : [question.correctAnswer, ...(question.acceptedAnswers ?? []).filter(Boolean)].join(" or ")}`}</strong>{question.explanation ? <div className="mt-1.5 text-sm leading-6 text-navy/65">{renderPracticeExplanation(question.explanation)}</div> : null}</div> : null}
        {saveError ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">Your score could not be saved. Try finishing again.</p> : null}
        <div className="mt-6 flex justify-end"><button type="button" disabled={!answer.trim() || saving} onClick={checked ? nextQuestion : () => setChecked(true)} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : checked ? currentIndex === questions.length - 1 ? "Finish practice" : "Next question" : "Check answer"}</button></div>
      </div>
    </section>
  );
}
