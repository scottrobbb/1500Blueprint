import Link from "next/link";
import { surface, primaryBtn, secondaryBtn, labelMuted } from "../shared/ui";
import { formatClock } from "../shared/Hud";
import { TrophyIcon } from "../shared/icons";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/test/icons";
import { VOCAB_MASTERY_TARGET } from "@/lib/drills/vocabProgress";

export type VocabSessionAnswer = {
  questionId: string;
  pos: string;
  definition: string;
  selectedWord: string;
  correctWord: string;
  correct: boolean;
  correctStreak: number;
  mastered: boolean;
};

export function VocabSummary({
  answers,
  seconds,
  savedCount,
  error,
  onPracticeAgain,
  returnHref = "/drills",
}: {
  answers: VocabSessionAnswer[];
  seconds: number;
  savedCount: number;
  error: string | null;
  onPracticeAgain: () => void;
  returnHref?: string;
}) {
  const correct = answers.filter((answer) => answer.correct).length;
  const total = answers.length;
  const score = total ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className={`${surface} overflow-hidden`}>
        <div className="border-b border-navy/10 px-6 py-7 text-center sm:px-10">
          <div className={labelMuted}>Drill complete!</div>
          <h2 className="mt-2 font-display text-3xl font-bold text-navy">Nice work</h2>
          <p className="mt-2 text-sm text-navy/55">You completed all seven vocabulary questions.</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-navy/10">
          <SummaryStat icon={<ClockIcon className="h-5 w-5" />} value={formatClock(seconds)} label="Time" />
          <SummaryStat icon={<TrophyIcon className="h-5 w-5" />} value={`${correct}/${total}`} label="Correct" />
          <SummaryStat icon={<CheckIcon className="h-5 w-5" />} value={`${score}%`} label="Score" />
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-card border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger-600">
          {error}
        </div>
      ) : null}

      <section className={`${surface} mt-5 overflow-hidden`}>
        <div className="border-b border-navy/10 px-5 py-4">
          <h3 className="font-display text-lg font-bold text-navy">Your answers</h3>
        </div>
        <ol className="divide-y divide-navy/10">
          {answers.map((answer, index) => (
            <li key={`${answer.questionId}-${index}`} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${answer.correct ? "bg-success-bg text-success-600" : "bg-danger-bg text-danger-600"}`}>
                  {answer.correct ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-sm leading-relaxed text-navy/70">
                    <span className="text-navy/45">({answer.pos})</span> {answer.definition}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {!answer.correct ? (
                      <span className="text-danger-600">Your answer: <strong>{answer.selectedWord}</strong></span>
                    ) : null}
                    <span className="text-success-600">Correct answer: <strong>{answer.correctWord}</strong></span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-navy/45">
                    {answer.mastered
                      ? "Mastered"
                      : `Progress to mastery: ${answer.correctStreak}/${VOCAB_MASTERY_TARGET}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {savedCount > 0 ? (
        <p className="mt-4 text-center text-sm text-navy/55">
          {savedCount} {savedCount === 1 ? "word" : "words"} in your Vocab Flashcards deck.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onPracticeAgain} className={primaryBtn}>Practice again</button>
        <Link href={returnHref} className={secondaryBtn}>
          Back to drills
        </Link>
      </div>
    </div>
  );
}

function SummaryStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-6 sm:px-6">
      <span className="text-navy/40">{icon}</span>
      <span className="font-display text-2xl font-bold tabular-nums text-navy sm:text-3xl">{value}</span>
      <span className={labelMuted}>{label}</span>
    </div>
  );
}
