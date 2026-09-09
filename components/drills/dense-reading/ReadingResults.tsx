"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DrillShell } from "../shared/DrillShell";
import { ExplanationText } from "@/components/test/ExplanationText";
import { MathText } from "@/components/test/MathText";
import { CalculatorPanel } from "@/components/test/CalculatorPanel";
import {
  formatReadingTime,
  STEP_LABELS,
  TOPICS,
} from "@/lib/dense-reading/method";
import {
  CHOICES,
  STEPS,
  type ReadingHistory,
  type ReadingSession,
} from "@/lib/dense-reading/types";
import { ReadingPassage } from "./ReadingPassage";
import { field, ReadingButton, surface } from "./ui";

export function ReadingResults({
  session,
  history,
}: {
  session: ReadingSession;
  history: ReadingHistory[];
}) {
  const router = useRouter();
  const [showAnswers, setShowAnswers] = useState(true);
  const [selected, setSelected] = useState(0);
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [calculator, setCalculator] = useState(false);
  const results = session.results ?? [];
  const correct = results.filter((r) => r.correct).length;
  const skipped = session.state.progress.filter((p) => p.skipped).length;
  const filtered = session.questions
    .map((q, i) => ({ q, i }))
    .filter(
      ({ q }) =>
        (topic === "all" || q.topic === topic) &&
        (difficulty === "all" || q.difficulty === difficulty),
    );
  const item = filtered.find(({ i }) => i === selected) ?? filtered[0];
  const topics = [...new Set(session.questions.map((q) => q.topic))];
  const stepTotal = (step: "passage" | "choice") =>
    session.state.progress.reduce((sum, p) => sum + (p.stepMs[step] ?? 0), 0);
  return (
    <DrillShell
      title="Dense Reading results"
      exitHref="/drills/dense-reading"
      exitLabel="Rounds"
      right={
        <ReadingButton secondary onClick={() => setCalculator(!calculator)}>
          Calculator
        </ReadingButton>
      }
    >
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy">
            Round complete
          </h1>
          <p className="mt-2 text-sm text-navy/60">
            {session.mode === "guided" ? "Guided practice" : "Regular practice"}{" "}
            ·{" "}
            {new Date(
              session.completedAt ?? session.createdAt,
            ).toLocaleString()}
          </p>
        </div>
        <label className="text-sm text-navy/70">
          Previous rounds
          <select
            className={`${field} mt-1 max-w-80`}
            aria-label="Choose a completed round"
            value={session.id}
            onChange={(e) =>
              router.push(`/drills/dense-reading/${e.target.value}`)
            }
          >
            {history
              .filter((row) => row.status === "completed")
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {new Date(
                    row.completedAt ?? row.createdAt,
                  ).toLocaleDateString()}{" "}
                  · {row.correct}/{row.total} · {row.mode}
                </option>
              ))}
            {!history.some((row) => row.id === session.id) ? (
              <option value={session.id}>Current round</option>
            ) : null}
          </select>
        </label>
      </header>
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Accuracy",
            value: `${Math.round((correct / session.questions.length) * 100)}%`,
          },
          {
            label: "Correct",
            value: `${correct} / ${session.questions.length}`,
          },
          {
            label: "Practice time",
            value: formatReadingTime(session.state.elapsedMs),
          },
          { label: "Skipped initially", value: String(skipped) },
        ].map((stat) => (
          <div key={stat.label} className={`${surface} p-5`}>
            <p className="text-sm text-navy/60">{stat.label}</p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums text-navy">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <section className={`${surface} mb-7 p-5`}>
        <h2 className="font-display text-lg font-semibold text-navy">
          By topic
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {topics.map((value) => {
            const ids = session.questions
              .filter((q) => q.topic === value)
              .map((q) => q.id);
            const count = results.filter(
              (r) => ids.includes(r.questionId) && r.correct,
            ).length;
            return (
              <div
                key={value}
                className="flex items-center justify-between gap-3 text-sm text-navy/75"
              >
                <span>{TOPICS[value].title}</span>
                <span className="tabular-nums">
                  {count} / {ids.length}
                </span>
              </div>
            );
          })}
        </div>
        {session.mode === "guided" ? (
          <div className="mt-5 border-t border-navy/10 pt-4 text-sm leading-7 text-navy/65">
            <p>
              Average passage time:{" "}
              {formatReadingTime(
                stepTotal("passage") / session.questions.length,
              )}{" "}
              · Average choice time:{" "}
              {formatReadingTime(
                stepTotal("choice") / session.questions.length,
              )}
            </p>
            <p>
              Answered without an initial skip:{" "}
              {
                session.state.progress.filter((p) => p.submitted && !p.skipped)
                  .length
              }{" "}
              / {session.questions.length}
            </p>
            <p>
              Answer order:{" "}
              {session.state.attemptOrder
                .map(
                  (id) => session.questions.findIndex((q) => q.id === id) + 1,
                )
                .join(" → ") || "No answers recorded"}
            </p>
          </div>
        ) : null}
      </section>
      <section aria-label="Answer review">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <h2 className="mr-auto font-display text-xl font-semibold text-navy">
            Review your answers
          </h2>
          <label className="text-xs text-navy/65">
            Topic
            <select
              className={`${field} mt-1`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="all">All topics</option>
              {topics.map((value) => (
                <option key={value} value={value}>
                  {TOPICS[value].title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-navy/65">
            Difficulty
            <select
              className={`${field} mt-1`}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="all">All levels</option>
              {[...new Set(session.questions.map((q) => q.difficulty))].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>
          <ReadingButton secondary onClick={() => setShowAnswers(!showAnswers)}>
            {showAnswers ? "Hide answers" : "Show answers"}
          </ReadingButton>
        </div>
        <nav
          aria-label="Review questions"
          className="mb-5 flex flex-wrap gap-2"
        >
          {filtered.map(({ q, i }) => (
            <button
              key={q.id}
              onClick={() => setSelected(i)}
              aria-label={`Question ${i + 1}${showAnswers ? (results[i]?.correct ? ", correct" : ", incorrect") : ""}`}
              aria-current={item?.i === i ? "step" : undefined}
              className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold ${item?.i === i ? "border-brand bg-navy text-white" : "border-navy/15 bg-white text-navy"}`}
            >
              {i + 1}
              {showAnswers ? (
                <span className="ml-1" aria-hidden="true">
                  {results[i]?.correct ? "✓" : "×"}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        {!item ? (
          <p className="py-8 text-navy/60">No questions match these filters.</p>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <ReadingPassage
              question={item.q}
              progress={session.state.progress[item.i]}
              guided={false}
              highlighter={false}
              readOnly
              dispatch={() => {}}
            />
            <div className={`${surface} min-w-0 p-5 sm:p-6`}>
              <p className="mb-3 text-xs font-medium text-navy/60">
                Question {item.i + 1} · {TOPICS[item.q.topic].title} ·{" "}
                {formatReadingTime(session.state.progress[item.i].elapsedMs)}
              </p>
              <h3 className="font-serif text-lg leading-7 text-exam-ink">
                <MathText>{item.q.prompt}</MathText>
              </h3>
              <div className="mt-5 space-y-3">
                {item.q.choices.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-4 ${showAnswers && c.id === results[item.i]?.correctAnswer ? "border-success/40 bg-success-bg" : "border-navy/15"}`}
                  >
                    <div className="font-serif text-base leading-7 text-exam-ink">
                      <strong className="mr-2 font-sans text-sm">{c.id}</strong>
                      <MathText>{c.text}</MathText>
                    </div>
                    {showAnswers &&
                    (c.id === results[item.i]?.answer ||
                      c.id === results[item.i]?.correctAnswer) ? (
                      <p className="mt-2 text-xs font-semibold text-navy">
                        {c.id === results[item.i]?.correctAnswer
                          ? "Correct answer"
                          : "Your answer"}
                        {c.id === results[item.i]?.correctAnswer &&
                        c.id === results[item.i]?.answer
                          ? " · Your answer"
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {showAnswers ? (
                <>
                  <div className="mt-6 text-sm leading-7 text-navy/75">
                    <h4 className="mb-2 font-semibold text-navy">
                      Explanation
                    </h4>
                    <ExplanationText
                      text={
                        results[item.i]?.explanation ||
                        "An explanation is not available for this question yet."
                      }
                    />
                  </div>
                  {session.mode === "guided" ? (
                    <details className="mt-5 border-t border-navy/10 pt-4">
                      <summary className="min-h-11 cursor-pointer font-semibold text-navy">
                        Your reading process
                      </summary>
                      <p className="my-3 whitespace-pre-wrap text-sm leading-6 text-navy/70">
                        <strong>Prediction:</strong>{" "}
                        {session.state.progress[item.i].prediction ||
                          "No prediction entered"}
                      </p>
                      <p className="mb-3 text-sm text-navy/65">
                        Round {session.state.progress[item.i].round ?? "—"} ·{" "}
                        {session.state.progress[item.i].skipped
                          ? "Skipped initially"
                          : "Solved on first visit"}
                      </p>
                      <dl className="space-y-2 text-sm text-navy/75">
                        {STEPS.filter(
                          (step) =>
                            session.state.progress[item.i].stepMs[step] !==
                            undefined,
                        ).map((step) => (
                          <div
                            key={step}
                            className="flex justify-between gap-3"
                          >
                            <dt>{STEP_LABELS[step]}</dt>
                            <dd className="tabular-nums">
                              {(
                                (session.state.progress[item.i].stepMs[step] ??
                                  0) / 1000
                              ).toFixed(1)}
                              s
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <details className="mt-4">
                        <summary className="min-h-11 cursor-pointer text-sm font-medium text-navy">
                          Segment and word timing
                        </summary>
                        <div className="mt-3 max-h-80 overflow-y-auto text-xs leading-6 text-navy/70">
                          <p>Passage segments</p>
                          {session.state.progress[item.i].segmentMs.map(
                            (ms, index) => (
                              <p key={index}>
                                Words {index * 5 + 1}–{index * 5 + 5}:{" "}
                                {(ms / 1000).toFixed(1)}s
                              </p>
                            ),
                          )}
                          {CHOICES.filter(
                            (id) => session.state.progress[item.i].wordMs[id],
                          ).map((id) => (
                            <div key={id} className="mt-3">
                              <strong>Choice {id}</strong>
                              {session.state.progress[item.i].wordMs[id]?.map(
                                (ms, index) => (
                                  <p key={index}>
                                    Word {index + 1}: {(ms / 1000).toFixed(1)}s
                                  </p>
                                ),
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </details>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )}
      </section>
      <Link
        href="/drills/dense-reading"
        className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-navy px-5 text-sm font-semibold text-white"
      >
        Back to reading rounds
      </Link>
      {calculator ? (
        <CalculatorPanel onClose={() => setCalculator(false)} />
      ) : null}
    </DrillShell>
  );
}
