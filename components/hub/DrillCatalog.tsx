import Link from "next/link";
import type { ReactNode } from "react";
import type { GrammarMasteryState } from "@/lib/drills/mastery";
import type { DrillSlug, QuestionStatus } from "@/lib/drills/types";
import { DrillIcon, type DrillIconKey } from "./icons";

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
} as const;

const countFormatter = new Intl.NumberFormat("en-US");

const primaryAction =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-navy px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-navy-700 active:bg-[#203e6f]";
const secondaryAction =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-navy/15 bg-white px-4 py-2.5 text-center text-sm font-semibold text-navy transition-colors hover:border-navy/25 hover:bg-haze active:bg-navy/[0.07]";

function IconTile({ name }: { name: DrillIconKey }) {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-brand/15 bg-ice text-brand-600">
      <DrillIcon name={name} className="h-[19px] w-[19px]" />
    </span>
  );
}

function PracticeCard({
  icon,
  title,
  description,
  adminPreview = false,
  detail,
  children,
}: {
  icon: DrillIconKey;
  title: string;
  description: string;
  adminPreview?: boolean;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-navy/12 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconTile name={icon} />
        <div className="min-w-0 pt-1">
          <h4 className="text-balance font-display text-[17px] font-semibold leading-5 text-navy">{title}</h4>
          {adminPreview ? <p className="mt-1 text-xs font-medium text-flag">Draft visible to admins</p> : null}
        </div>
      </div>
      <p className="mt-4 text-pretty text-sm leading-6 text-navy/60">{description}</p>
      {detail ? <div className="mt-4">{detail}</div> : null}
      <div className="mt-auto flex flex-wrap gap-2.5 pt-6">{children}</div>
    </article>
  );
}

function PracticeSection({
  id,
  title,
  description,
  columns = 2,
  children,
}: {
  id: string;
  title: string;
  description: string;
  columns?: 2 | 3;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 max-w-[620px]">
        <h3 id={id} className="font-display text-xl font-semibold tracking-[-0.015em] text-navy">
          {title}
        </h3>
        <p className="mt-1 text-pretty text-sm leading-6 text-navy/55">{description}</p>
      </div>
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>{children}</div>
    </section>
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
      ? Math.min(100, Math.round((grammarMastery.mastered / grammarMastery.total) * 100))
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
  const historyHref = (slug: DrillSlug) =>
    `${workspace === "ultimate" ? "/ultimate/history" : "/history"}?drill=${slug}`;
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
  const showReadingWriting = isAdmin || !locked.grammar || !locked.reading || !locked.wordScan;
  const showMath = isAdmin || !locked.targetedMath || !locked.aiMath;
  const showVocabulary = isAdmin || !locked.vocab || !locked.flashcards;

  return (
    <section
      id="practice-drills"
      aria-labelledby="practice-drills-heading"
      className="mx-auto w-full max-w-[1120px] scroll-mt-24 px-4 pb-12 pt-12 sm:px-6 sm:pt-14"
    >
      <div className="mb-8 max-w-[640px]">
        <h2
          id="practice-drills-heading"
          className="text-balance font-display text-[24px] font-bold tracking-[-0.02em] text-navy"
        >
          Practice by skill
        </h2>
        <p className="mt-2 text-pretty text-[15px] leading-6 text-navy/60">
          Choose one skill and complete a focused set. Short, deliberate sessions make it easier to see what is improving.
        </p>
      </div>

      {isAdmin && hasLockedDrills ? (
        <p className="mb-8 rounded-lg border border-gold/35 bg-flag-bg px-4 py-3 text-sm leading-6 text-navy/65">
          Some drills are still drafts. They remain visible here so admins can review them before publishing.
        </p>
      ) : null}

      {!hasVisibleDrills ? (
        <div className="rounded-xl border border-navy/12 bg-white px-5 py-12 text-center">
          <h3 className="font-display text-base font-semibold text-navy">No practice drills are available yet</h3>
          <p className="mt-1 text-sm text-navy/55">Check back after the next content update.</p>
        </div>
      ) : null}

      <div className="space-y-12">
        {showReadingWriting ? (
          <PracticeSection
            id="reading-writing-practice-heading"
            title="Reading and writing"
            description="Build command of grammar, passage comprehension, and the wording patterns that drive answer choices."
            columns={3}
          >
            {isAdmin || !locked.grammar ? (
              <PracticeCard
                icon="grammar"
                title="Grammar reasoning"
                description="Explain why an answer follows the rule, then get feedback on both your choice and your reasoning."
                adminPreview={isAdmin && locked.grammar}
                detail={
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-navy/50">
                      <span className="tabular-nums">
                        {countFormatter.format(grammarMastery.mastered)} of {countFormatter.format(grammarMastery.total)} patterns mastered
                      </span>
                      <span className="tabular-nums">{streak}-day study streak</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Grammar patterns mastered"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={grammarBarPct}
                      className="h-1.5 overflow-hidden rounded-full bg-navy/[0.09]"
                    >
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${grammarBarPct}%` }} />
                    </div>
                  </div>
                }
              >
                <Link href={href.grammar} className={primaryAction}>Practice grammar</Link>
                <Link href={historyHref("grammar")} className={secondaryAction}>View history</Link>
              </PracticeCard>
            ) : null}
            {isAdmin || !locked.reading ? (
              <PracticeCard
                icon="reading"
                title="Reading comprehension"
                description="Read a difficult SAT passage under time pressure, then reconstruct its central idea from memory."
                adminPreview={isAdmin && locked.reading}
              >
                <Link href={href.reading} className={primaryAction}>Practice reading</Link>
                <Link href={historyHref("reading")} className={secondaryAction}>View history</Link>
              </PracticeCard>
            ) : null}

            {isAdmin || !locked.wordScan ? (
              <PracticeCard
                icon="scan"
                title="Answer-choice word scan"
                description="Train your eye to notice high-risk wording before it costs you time or leads you to a tempting wrong answer."
                adminPreview={isAdmin && locked.wordScan}
                detail={<p className="text-xs leading-5 text-navy/50">Choose the keyword family you want to recognize faster.</p>}
              >
                <Link href={href.wordScanCeased} className={`${secondaryAction} flex-1`}>Practice “ceased”</Link>
                <Link href={href.wordScanBadMold} className={`${secondaryAction} flex-1`}>Practice “bad mold”</Link>
              </PracticeCard>
            ) : null}
          </PracticeSection>
        ) : null}

        {showMath ? (
          <PracticeSection
            id="math-practice-heading"
            title="Math"
            description="Choose a controlled challenge or generate a fresh set based on the areas that need more work."
          >
            {isAdmin || !locked.targetedMath ? (
              <PracticeCard
                icon="target"
                title="Targeted math challenge"
                description="Reach 10 correct answers before your attempts run out. Start at medium or raise the difficulty."
                adminPreview={isAdmin && locked.targetedMath}
              >
                <Link href={href.mathMedium} className={primaryAction}>Start medium</Link>
                <Link href={href.mathHard} className={secondaryAction}>Start hard</Link>
              </PracticeCard>
            ) : null}

            {isAdmin || !locked.aiMath ? (
              <PracticeCard
                icon="aimath"
                title="Adaptive math practice"
                description="Generate fresh questions focused on your weaker areas when you need practice beyond a fixed set."
                adminPreview={isAdmin && locked.aiMath}
              >
                <Link href={href.aiMath} className={primaryAction}>Generate a practice set</Link>
              </PracticeCard>
            ) : null}
          </PracticeSection>
        ) : null}

        {showVocabulary ? (
          <PracticeSection
            id="vocabulary-practice-heading"
            title="Vocabulary"
            description="Learn high-value words through timed recall, then revisit the terms that need another pass."
          >
            {isAdmin || !locked.vocab ? (
              <PracticeCard
                icon="vocab"
                title="Vocabulary recall"
                description="Match definitions to SAT vocabulary in a timed session and build reliable recall through repetition."
                adminPreview={isAdmin && locked.vocab}
                detail={
                  <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-navy/50">
                    <div className="flex gap-1"><dt className="order-2">words</dt><dd className="order-1 font-semibold tabular-nums text-navy">{countFormatter.format(vocabStats.words)}</dd></div>
                    <div className="flex gap-1"><dt className="order-2">mastered</dt><dd className="order-1 font-semibold tabular-nums text-navy">{countFormatter.format(vocabStats.mastered)}</dd></div>
                    <div className="flex gap-1"><dt className="order-2">best streak</dt><dd className="order-1 font-semibold tabular-nums text-navy">{countFormatter.format(vocabStats.bestStreak)}</dd></div>
                  </dl>
                }
              >
                <Link href={href.vocab} className={primaryAction}>Practice vocabulary</Link>
                <Link href={historyHref("vocab")} className={secondaryAction}>View history</Link>
              </PracticeCard>
            ) : null}

            {isAdmin || !locked.flashcards ? (
              <PracticeCard
                icon="flashcards"
                title="Saved-word flashcards"
                description="Review vocabulary you saved during practice and give difficult words another repetition."
                adminPreview={isAdmin && locked.flashcards}
                detail={
                  <p className="text-xs tabular-nums text-navy/50">
                    {countFormatter.format(vocabStats.flashcards)} {vocabStats.flashcards === 1 ? "card" : "cards"} saved
                  </p>
                }
              >
                <Link href={href.flashcards} className={primaryAction}>Review saved words</Link>
              </PracticeCard>
            ) : null}
          </PracticeSection>
        ) : null}
      </div>
    </section>
  );
}
