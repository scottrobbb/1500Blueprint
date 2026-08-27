import Link from "next/link";
import type { ReactNode } from "react";
import type { GrammarMasteryState } from "@/lib/drills/mastery";
import type { DrillSlug, QuestionStatus } from "@/lib/drills/types";
import { DrillIcon, type DrillIconKey } from "./icons";
import { PlayIcon } from "@/components/shell/icons";

const BASE_HREF = {
  grammar: "/drills/grammar",
  reading: "/drills/reading",
  wordScanCeased: "/drills/word-scan?mode=ceased",
  wordScanBadMold: "/drills/word-scan?mode=bad-mold",
  mathMedium: "/drills/targeted-math?difficulty=medium",
  mathHard: "/drills/targeted-math?difficulty=hard",
  aiMath: "/drills/ai-math",
  vocab: "/drills/vocab",
  flashcards: "/drills/flashcards",
};

function CategoryHeader({ title }: { title: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-navy/55">{title}</h3>
      <span className="h-px flex-1 bg-navy/12" />
    </div>
  );
}

function IconTile({ name, large = true }: { name: DrillIconKey; large?: boolean }) {
  return (
    <span
      className={`flex flex-none items-center justify-center bg-[#eef3fb] text-[#2b6fd6] ${
        large ? "h-10 w-10 rounded-[11px]" : "h-[38px] w-[38px] rounded-[10px]"
      }`}
    >
      <DrillIcon name={name} className={large ? "h-[21px] w-[21px]" : "h-5 w-5"} />
    </span>
  );
}

const cardBox = "flex h-full flex-col rounded-2xl bg-white p-[22px] shadow-pop";
const startBtn =
  "inline-flex flex-1 items-center justify-center gap-[7px] rounded-[11px] bg-brand px-3 py-3 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px";
const ghostBtn = "rounded-[11px] bg-haze px-4 py-3 text-[13px] font-semibold text-navy transition-colors hover:bg-navy/10";

function LockableCard({ locked, title, children }: { locked: boolean; title: string; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative h-full">
      <div inert aria-hidden="true" className="h-full select-none opacity-30 grayscale">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 p-5 backdrop-blur-[1px]">
        <div role="status" className="max-w-[220px] rounded-xl border border-gold/45 bg-[#fffaf0] px-5 py-4 text-center shadow-sm">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-gold-600">Not published</div>
          <p className="mt-1.5 text-[13px] font-semibold leading-5 text-navy/70">{title} is not currently available.</p>
        </div>
      </div>
    </div>
  );
}

export function DrillCatalog({
  grammarMastery,
  vocabStats,
  streak,
  isAdmin,
  publication,
  workspace = "legacy",
}: {
  grammarMastery: GrammarMasteryState;
  vocabStats: { words: number; mastered: number; bestStreak: number; flashcards: number };
  streak: number;
  isAdmin: boolean;
  publication: Partial<Record<DrillSlug, QuestionStatus>>;
  workspace?: "legacy" | "ultimate";
}) {
  const grammarBarPct =
    grammarMastery.total > 0
      ? Math.round((grammarMastery.mastered / grammarMastery.total) * 100)
      : 0;
  const drillHref = (value: string) => {
    if (workspace !== "ultimate") return value;
    return `${value}${value.includes("?") ? "&" : "?"}workspace=ultimate`;
  };
  const href = {
    grammar: drillHref(BASE_HREF.grammar),
    reading: drillHref(BASE_HREF.reading),
    wordScanCeased: drillHref(BASE_HREF.wordScanCeased),
    wordScanBadMold: drillHref(BASE_HREF.wordScanBadMold),
    mathMedium: drillHref(BASE_HREF.mathMedium),
    mathHard: drillHref(BASE_HREF.mathHard),
    aiMath: drillHref(BASE_HREF.aiMath),
    vocab: drillHref(BASE_HREF.vocab),
    flashcards: drillHref(BASE_HREF.flashcards),
  };
  const historyHref = (slug: DrillSlug) => `${workspace === "ultimate" ? "/ultimate/history" : "/history"}?drill=${slug}`;
  const locked = {
    grammar: publication.grammar !== "published",
    reading: publication.reading !== "published",
    wordScan: publication["word-scan"] !== "published",
    targetedMath: publication["targeted-math"] !== "published",
    aiMath: publication["ai-math"] !== "published",
    vocab: publication.vocab !== "published",
    flashcards: publication.flashcards !== "published",
  };
  const hasLockedDrills = Object.values(locked).some(Boolean);
  const hasVisibleDrills = isAdmin || Object.values(locked).some((value) => !value);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-12 pt-[30px]">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-navy">Practice Drills</h2>
        <span className="text-[13px] text-navy/50">Build streaks. Master one pattern at a time.</span>
      </div>

      {isAdmin && hasLockedDrills && (
        <div className="mb-6 rounded-xl border border-gold/40 bg-gold/[0.07] px-4 py-3 text-[13px] font-semibold leading-5 text-navy/70">
          Draft drills are hidden from students. Admin links remain available for content QA.
        </div>
      )}

      {!hasVisibleDrills ? (
        <div className="rounded-2xl border border-navy/10 bg-white px-5 py-12 text-center text-sm font-semibold text-navy/55">
          No drills are currently published.
        </div>
      ) : null}

      {/* Writing */}
      {isAdmin || !locked.grammar ? <>
      <CategoryHeader title="Writing" />
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <LockableCard locked={locked.grammar && !isAdmin} title="Grammar Drill">
          <div className={cardBox}>
          <div className="flex items-center gap-3.5">
            <IconTile name="grammar" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">
                Writing <span className="text-brand-600">· AI</span>
              </div>
              <h4 className="mt-0.5 font-display text-lg font-bold leading-[1.15] tracking-[-0.01em] text-[#152347]">
                Grammar Drill
              </h4>
            </div>
          </div>
          <p className="mt-[13px] text-[13.5px] leading-[1.55] text-navy/60">
            Master grammar patterns by writing out your reasoning, graded on process, not just the pick.
          </p>
          <div className="mt-4">
            <div className="mb-[7px] flex items-center justify-between text-[11.5px] font-semibold text-navy/50">
              <span>
                {grammarMastery.mastered} / {grammarMastery.total} patterns mastered
              </span>
              <span className="inline-flex items-center gap-1 text-flag">
                <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" aria-hidden="true">
                  <path d="M12 3s5 3.5 5 8.5a5 5 0 0 1-10 0c0-1.6.6-2.8 1.3-3.6.2 1.2.9 1.9 1.7 2.1C9.4 7.8 12 6.3 12 3z" fill="#ffbd20" stroke="#f0a900" strokeWidth="1.2" />
                </svg>
                {streak} streak
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-navy/[0.09]">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${grammarBarPct}%` }}
              />
            </div>
          </div>
          <div className="mt-auto flex items-center gap-2.5 pt-[18px]">
            <Link href={href.grammar} className={startBtn}>
              <PlayIcon className="h-3.5 w-3.5" />
              Start practice
            </Link>
            <Link href={historyHref("grammar")} className={ghostBtn}>
              History
            </Link>
          </div>
          </div>
        </LockableCard>
      </div>
      </> : null}

      {/* Reading */}
      {isAdmin || !locked.reading || !locked.wordScan ? <>
      <CategoryHeader title="Reading" />
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {isAdmin || !locked.reading ? (
        <LockableCard
          locked={locked.reading && !isAdmin}
          title="Reading Comprehension"
        >
          <div className={cardBox}>
          <div className="flex items-center gap-3.5">
            <IconTile name="reading" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">
                Reading <span className="text-brand-600">· AI</span>
              </div>
              <h4 className="mt-0.5 font-display text-lg font-bold leading-[1.15] tracking-[-0.01em] text-[#152347]">
                Reading Comprehension
              </h4>
            </div>
          </div>
          <p className="mt-[13px] text-[13.5px] leading-[1.55] text-navy/60">
            Comprehend hard SAT passages under time pressure, then recall the gist from memory.
          </p>
          <div className="mt-auto flex items-center gap-2.5 pt-[18px]">
            <Link href={href.reading} className={startBtn}>
              <PlayIcon className="h-3.5 w-3.5" />
              Start practice
            </Link>
            <Link href={historyHref("reading")} className={ghostBtn}>
              History
            </Link>
          </div>
          </div>
        </LockableCard>
        ) : null}

        {isAdmin || !locked.wordScan ? (
        <LockableCard locked={locked.wordScan && !isAdmin} title="Word Scan Drill">
          <div className={cardBox}>
          <div className="flex items-center gap-3.5">
            <IconTile name="scan" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">Reading · Speed</div>
              <h4 className="mt-0.5 font-display text-lg font-bold leading-[1.15] tracking-[-0.01em] text-[#152347]">
                Word Scan Drill
              </h4>
            </div>
          </div>
          <p className="mt-[13px] text-[13.5px] leading-[1.55] text-navy/60">
            Train your eye to spot elimination keywords before the timer drains. Pure speed reps.
          </p>
          <div className="mt-auto flex gap-2.5 pt-[18px]">
            <Link
              href={href.wordScanCeased}
              className="flex-1 rounded-[11px] bg-haze px-3 py-3 text-center text-[13.5px] font-bold text-navy transition-colors hover:bg-navy/10"
            >
              Ceased
            </Link>
            <Link
              href={href.wordScanBadMold}
              className="flex-1 rounded-[11px] bg-haze px-3 py-3 text-center text-[13.5px] font-bold text-navy transition-colors hover:bg-navy/10"
            >
              Bad Mold
            </Link>
          </div>
          </div>
        </LockableCard>
        ) : null}
      </div>
      </> : null}

      {/* Math */}
      {isAdmin || !locked.targetedMath || !locked.aiMath ? <>
      <CategoryHeader title="Math" />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isAdmin || !locked.targetedMath ? <>
        <MathCard
          locked={locked.targetedMath && !isAdmin}
          name="target"
          tier="Medium"
          tierClass="text-success-600"
          desc="Get 10 right before your lives run out."
          href={href.mathMedium}
          cta="Start Challenge"
          ctaClass="bg-navy text-white shadow-[0_2px_0_#07193b]"
        />
        <MathCard
          locked={locked.targetedMath && !isAdmin}
          name="target"
          tier="Hard"
          tierClass="text-danger-600"
          desc="Same rules, brutal questions. For 1500-chasers."
          href={href.mathHard}
          cta="Start Challenge"
          ctaClass="bg-navy text-white shadow-[0_2px_0_#07193b]"
        />
        </> : null}
        {isAdmin || !locked.aiMath ? (
        <MathCard
          locked={locked.aiMath && !isAdmin}
          name="aimath"
          tier="Beta"
          tierClass="text-brand-600"
          title="AI Math"
          desc="Fresh AI-generated questions tuned to your weak spots."
          href={href.aiMath}
          cta="Start Practice"
          ctaClass="bg-brand text-white shadow-[0_2px_0_#2b8fe0]"
        />
        ) : null}
      </div>
      </> : null}

      {/* Vocabulary */}
      {isAdmin || !locked.vocab || !locked.flashcards ? <>
      <CategoryHeader title="Vocabulary" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isAdmin || !locked.vocab ? (
        <LockableCard locked={locked.vocab && !isAdmin} title="Vocab Drill">
          <div className={cardBox}>
          <div className="flex items-center gap-3.5">
            <IconTile name="vocab" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">Vocabulary</div>
              <h4 className="mt-0.5 font-display text-lg font-bold leading-[1.15] tracking-[-0.01em] text-[#152347]">
                Vocab Drill
              </h4>
            </div>
          </div>
          <p className="mt-[13px] text-[13.5px] leading-[1.55] text-navy/60">
            Match definitions to terms in a timed session. Beat your best streak.
          </p>
          <div className="mt-4 flex gap-4 text-xs text-navy/55">
            <span>
              <strong className="text-navy">{vocabStats.words}</strong> words
            </span>
            <span>
              <strong className="text-navy">{vocabStats.mastered}</strong> mastered
            </span>
            <span>
              <strong className="text-navy">{vocabStats.bestStreak}</strong> best streak
            </span>
          </div>
          <div className="mt-auto flex gap-2.5 pt-[18px]">
            <Link href={href.vocab} className={startBtn}>
              <PlayIcon className="h-3.5 w-3.5" />
              Start practice
            </Link>
            <Link href={historyHref("vocab")} className={ghostBtn}>
              History
            </Link>
          </div>
          </div>
        </LockableCard>
        ) : null}

        {isAdmin || !locked.flashcards ? (
        <LockableCard locked={locked.flashcards && !isAdmin} title="Vocab Flashcards">
          <div className={cardBox}>
          <div className="flex items-center gap-3.5">
            <IconTile name="flashcards" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">Vocabulary</div>
              <h4 className="mt-0.5 font-display text-lg font-bold leading-[1.15] tracking-[-0.01em] text-[#152347]">
                Vocab Flashcards
              </h4>
            </div>
          </div>
          <p className="mt-[13px] text-[13.5px] leading-[1.55] text-navy/60">
            Review the words you save from the Vocab Drill with spaced repetition.
          </p>
          <div className="mt-4 flex gap-4 text-xs text-navy/55">
            <span>
              <strong className="text-navy">{vocabStats.flashcards}</strong> in deck
            </span>
          </div>
          <div className="mt-auto flex gap-2.5 pt-[18px]">
            <Link
              href={href.flashcards}
              className="flex-1 rounded-[11px] bg-haze px-3 py-3 text-center text-sm font-bold text-navy transition-colors hover:bg-navy/10"
            >
              Instructions
            </Link>
            <Link href={href.flashcards} className={ghostBtn}>
              Manage
            </Link>
          </div>
          </div>
        </LockableCard>
        ) : null}
      </div>
      </> : null}
    </div>
  );
}

function MathCard({
  locked,
  name,
  tier,
  tierClass,
  title = "Targeted Math",
  desc,
  href,
  cta,
  ctaClass,
}: {
  locked: boolean;
  name: DrillIconKey;
  tier: string;
  tierClass: string;
  title?: string;
  desc: string;
  href: string;
  cta: string;
  ctaClass: string;
}) {
  return (
    <LockableCard locked={locked} title={title}>
      <div className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-pop">
      <div className="flex items-center gap-3">
        <IconTile name={name} large={false} />
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy/40">
            Math <span className={tierClass}>· {tier}</span>
          </div>
          <h4 className="mt-0.5 font-display text-[17px] font-bold tracking-[-0.01em] text-[#152347]">{title}</h4>
        </div>
      </div>
      <p className="mt-[13px] text-[13px] leading-[1.55] text-navy/60">{desc}</p>
      <Link
        href={href}
        className={`mt-auto rounded-[11px] px-3 py-3 text-center text-[13.5px] font-bold transition-transform active:translate-y-px ${ctaClass}`}
      >
        {cta}
      </Link>
      </div>
    </LockableCard>
  );
}
