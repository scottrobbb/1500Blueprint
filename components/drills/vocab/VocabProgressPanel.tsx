import { formatClock } from "../shared/Hud";
import { primaryBtn, surface } from "../shared/ui";
import { FlameIcon, TrophyIcon } from "../shared/icons";
import {
  VOCAB_MASTERY_TARGET,
  type VocabAttemptStats,
  type VocabWordProgress,
} from "@/lib/drills/vocabProgress";

export function VocabProgressPanel({
  totalWords,
  masteredCount,
  currentStreak,
  bestStreak,
  autoAdd,
  words,
  attempts,
  settingsPending,
  onToggleAutoAdd,
  onStart,
}: {
  totalWords: number;
  masteredCount: number;
  currentStreak: number;
  bestStreak: number;
  autoAdd: boolean;
  words: VocabWordProgress[];
  attempts: VocabAttemptStats;
  settingsPending: boolean;
  onToggleAutoAdd: () => void;
  onStart: () => void;
}) {
  const mastered = words.filter((word) => word.mastered);
  const inProgress = words.filter((word) => !word.mastered);
  const masteryPercent = totalWords ? Math.round((masteredCount / totalWords) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className={`${surface} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-navy">Vocabulary progress</h2>
            <p className="mt-1 text-sm text-navy/55">
              Get a term correct {VOCAB_MASTERY_TARGET} times in a row to master it.
            </p>
          </div>
          <button type="button" onClick={onStart} className={primaryBtn}>Start a 7-word drill</button>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-navy/10">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${masteryPercent}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold text-navy/50">
          <span>{masteredCount} of {totalWords} mastered</span>
          <span>{masteryPercent}%</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ProgressStat icon={<TrophyIcon className="h-5 w-5" />} value={String(masteredCount)} label="Words mastered" />
          <ProgressStat icon={<FlameIcon className="h-5 w-5" />} value={String(currentStreak)} label="Current streak" />
          <ProgressStat icon={<FlameIcon className="h-5 w-5" />} value={String(bestStreak)} label="Best streak" />
        </div>
      </section>

      <section className={`${surface} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-navy">Automatic flashcards</h3>
            <p className="mt-1 text-sm text-navy/50">Add the correct term whenever you miss its definition.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoAdd}
            disabled={settingsPending}
            onClick={onToggleAutoAdd}
            className={`rounded-chip px-4 py-2 text-sm font-bold disabled:opacity-50 ${autoAdd ? "bg-success-bg text-success-600" : "bg-navy/5 text-navy/55"}`}
          >
            Auto-add: {autoAdd ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      <section className={`${surface} overflow-hidden`}>
        <div className="border-b border-navy/10 px-5 py-4">
          <h3 className="font-display text-lg font-bold text-navy">Session averages</h3>
        </div>
        <div className="grid grid-cols-3 divide-x divide-navy/10">
          <AttemptWindow label="Last 3" accuracy={attempts.last3.accuracy} seconds={attempts.last3.averageSeconds} />
          <AttemptWindow label="Last 10" accuracy={attempts.last10.accuracy} seconds={attempts.last10.averageSeconds} />
          <AttemptWindow label="All time" accuracy={attempts.all.accuracy} seconds={attempts.all.averageSeconds} />
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <WordList title="Words in progress" empty="Answer a word correctly to begin its mastery streak." words={inProgress} />
        <WordList title="Mastered words" empty="Your mastered words will appear here." words={mastered} />
      </div>
    </div>
  );
}

function ProgressStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-card bg-haze px-4 py-4">
      <span className="text-navy/35">{icon}</span>
      <div className="mt-2 font-display text-2xl font-bold text-navy">{value}</div>
      <div className="text-xs text-navy/50">{label}</div>
    </div>
  );
}

function AttemptWindow({ label, accuracy, seconds }: { label: string; accuracy: number | null; seconds: number | null }) {
  return (
    <div className="px-3 py-5 text-center sm:px-5">
      <div className="text-xs font-bold uppercase tracking-wide text-navy/40">{label}</div>
      <div className="mt-2 font-display text-xl font-bold text-navy">{accuracy == null ? "-" : `${accuracy}%`}</div>
      <div className="mt-1 text-xs text-navy/45">{seconds == null ? "No sessions" : `${formatClock(seconds)} avg`}</div>
    </div>
  );
}

function WordList({ title, empty, words }: { title: string; empty: string; words: VocabWordProgress[] }) {
  return (
    <section className={`${surface} overflow-hidden`}>
      <div className="border-b border-navy/10 px-5 py-4">
        <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
      </div>
      {words.length === 0 ? (
        <p className="px-5 py-6 text-sm text-navy/45">{empty}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-navy/10 overflow-y-auto">
          {words.map((word) => (
            <li key={word.questionId} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-serif font-semibold text-navy">{word.word}</span>
              <span className={word.mastered ? "font-semibold text-success-600" : "text-navy/45"}>
                {word.mastered ? "Mastered" : `${word.correctStreak}/${VOCAB_MASTERY_TARGET}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
