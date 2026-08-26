"use client";

import { useMemo, useState } from "react";
import { formatTime } from "@/lib/sat/testState";
import { isCorrect } from "@/lib/sat/scoring";
import { subjectFor, topicFor } from "@/lib/sat/results";
import type { AnswerMap, ChoiceId, Section, TestModule } from "@/lib/sat/types";
import { MathText } from "./MathText";
import { QuestionContent } from "./QuestionContent";
import { ArrowLeftIcon, CheckIcon, CloseIcon } from "./icons";

type Props = {
  label: string;
  section: Section;
  module: TestModule;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  onBack: () => void;
};

export function AnswerReviewDashboard({
  label,
  section,
  module,
  answers,
  perQuestionTime,
  onBack,
}: Props) {
  const [difficulty, setDifficulty] = useState("all");
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState(module.questions[0]?.id ?? "");
  const [hideAnswers, setHideAnswers] = useState(false);

  const subjects = useMemo(
    () => [...new Set(module.questions.map((question) => subjectFor(section.id, question)))].sort(),
    [module, section.id],
  );
  const topics = useMemo(
    () => [...new Set(module.questions.map(topicFor))].sort(),
    [module],
  );
  const filtered = module.questions.filter(
    (question) =>
      (difficulty === "all" || question.difficulty === difficulty) &&
      (subject === "all" || subjectFor(section.id, question) === subject) &&
      (topic === "all" || topicFor(question) === topic),
  );
  const question = filtered.find((item) => item.id === selectedQuestionId) ?? filtered[0];
  const originalIndex = question ? module.questions.findIndex((item) => item.id === question.id) : -1;
  const answer = question ? answers[question.id] : undefined;
  const correct = question ? isCorrect(question, answer) : false;

  return (
    <main className="min-h-dvh bg-slate-50 text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to summary
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-extrabold text-ink">{label} - Your Answers</h1>
            <p className="text-xs text-slate-500">Review responses, explanations, and time spent.</p>
          </div>
          <button
            type="button"
            onClick={() => setHideAnswers((hidden) => !hidden)}
            aria-pressed={hideAnswers}
            className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            {hideAnswers ? "Show answers" : "Hide answers"}
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-4 sm:grid-cols-3 sm:px-6">
          <Filter label="Difficulty" value={difficulty} onChange={setDifficulty} options={["easy", "medium", "hard"]} />
          <Filter label="Subject" value={subject} onChange={setSubject} options={subjects} />
          <Filter label="Topic" value={topic} onChange={setTopic} options={topics} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <span>{filtered.length} of {module.questions.length} questions</span>
          {question ? <span>{formatTime(perQuestionTime[question.id] ?? 0)} spent</span> : null}
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-2" aria-label="Jump to question">
          {filtered.map((item) => {
            const index = module.questions.findIndex((questionItem) => questionItem.id === item.id);
            const itemCorrect = isCorrect(item, answers[item.id]);
            const selected = item.id === question?.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedQuestionId(item.id)}
                aria-label={`Question ${index + 1}, ${itemCorrect ? "correct" : "incorrect"}`}
                aria-current={selected ? "true" : undefined}
                className={`h-9 min-w-9 cursor-pointer rounded-md border text-xs font-bold transition-colors ${
                  selected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : itemCorrect
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400"
                      : "border-red-200 bg-red-50 text-red-700 hover:border-red-400"
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>

        {!question ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">
            No questions match these filters.
          </div>
        ) : (
          <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid lg:grid-cols-2">
            <div className="border-b border-slate-200 bg-slate-50 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">Question {originalIndex + 1}</span>
                <span className="capitalize">{question.difficulty}</span>
                <span aria-hidden>·</span>
                <span>{topicFor(question)}</span>
              </div>
              {question.figureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={question.figureUrl} alt="Figure for this question" width={1200} height={800} className="mb-5 h-auto max-h-72 max-w-full object-contain" />
              ) : null}
              {question.passage ? (
                <QuestionContent text={question.passage} pClassName="whitespace-pre-line font-serif text-[15px] leading-7 text-slate-800" />
              ) : (
                <p className="text-sm leading-6 text-slate-500">No separate passage for this question.</p>
              )}
            </div>

            <div className="p-6 lg:p-8">
              <div className={`mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {correct ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}
                {correct ? "Correct" : "Incorrect"}
              </div>
              <p className="font-serif text-[16px] font-semibold leading-7 text-ink">
                <MathText>{question.prompt}</MathText>
              </p>

              {question.type === "mc" ? (
                <div className="mt-5 space-y-2.5">
                  {question.choices.map((choice) => {
                    const isAnswer = choice.id === answer;
                    const isKey = choice.id === question.correct;
                    return (
                      <div
                        key={choice.id}
                        className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                          hideAnswers
                            ? "border-slate-200 bg-white"
                            : isKey
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : isAnswer
                                ? "border-red-300 bg-red-50 text-red-900"
                                : "border-slate-200 text-slate-700"
                        }`}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-bold">{choice.id}</span>
                        <span className="min-w-0 flex-1 whitespace-pre-line"><MathText>{choice.text}</MathText></span>
                        {!hideAnswers && isKey ? <span className="text-[11px] font-bold">Correct answer</span> : null}
                        {!hideAnswers && isAnswer && !isKey ? <span className="text-[11px] font-bold">Your answer</span> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <AnswerCard label="Your answer" value={answer == null || answer === "" ? "Omitted" : String(answer)} correct={correct} />
                  {!hideAnswers ? <AnswerCard label="Correct answer" value={question.acceptedAnswers.join(" or ")} correct /> : null}
                </div>
              )}

              {!hideAnswers && question.explanation ? (
                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="font-bold text-navy">Explanation</p>
                  <p className="mt-1"><MathText>{question.explanation}</MathText></p>
                  {question.type === "mc" && answer && answer !== question.correct && question.choiceExplanations?.[answer as ChoiceId] ? (
                    <p className="mt-2 border-t border-blue-100 pt-2">
                      <span className="font-semibold">Your choice: </span>
                      <MathText>{question.choiceExplanations[answer as ChoiceId] ?? ""}</MathText>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-brand-600"
      >
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function AnswerCard({ label, value, correct }: { label: string; value: string; correct: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</span>
      <span className="mt-1 block font-semibold">{value}</span>
    </div>
  );
}
