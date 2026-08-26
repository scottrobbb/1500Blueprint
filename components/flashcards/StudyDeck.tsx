"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DrillShell } from "@/components/drills/shared/DrillShell";
import { ProgressBar } from "@/components/drills/shared/Hud";
import { accentBtn, label, secondaryBtn } from "@/components/drills/shared/ui";
import { CheckCircleIcon } from "@/components/drills/shared/icons";
import { MathText } from "@/components/test/MathText";
import type { FlashcardCard } from "@/lib/flashcards/types";
import { ChevronLeftIcon, RotateIcon, ShuffleIcon } from "./icons";

type Phase = "study" | "summary";
type Grade = "known" | "learning";

function shuffle(indices: number[]): number[] {
  const a = indices.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function StudyDeck({
  title,
  cards,
  backHref,
  variant = "default",
}: {
  title: string;
  cards: FlashcardCard[];
  backHref: string;
  variant?: "default" | "ultimate";
}) {
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<string, Grade>>({});
  const [phase, setPhase] = useState<Phase>("study");
  const [shuffled, setShuffled] = useState(false);

  const total = order.length;
  const card = cards[order[pos]];

  function grade(g: Grade) {
    if (!card) return;
    setResults((prev) => ({ ...prev, [card.id]: g }));
    if (pos + 1 >= total) {
      setPhase("summary");
    } else {
      setPos((p) => p + 1);
      setFlipped(false);
    }
  }
  function prev() {
    if (pos === 0) return;
    setPos((p) => p - 1);
    setFlipped(false);
  }
  function startRun(indices: number[], asShuffled: boolean) {
    setOrder(indices);
    setPos(0);
    setFlipped(false);
    setResults({});
    setShuffled(asShuffled);
    setPhase("study");
  }
  function toggleShuffle() {
    const base = cards.map((_, i) => i);
    startRun(shuffled ? base : shuffle(base), !shuffled);
  }

  // Keyboard: Space/Enter flips (unless a control is focused), ArrowLeft goes
  // back, 1 = still learning, 2 = got it.
  useEffect(() => {
    if (phase !== "study") return;
    function onKey(e: KeyboardEvent) {
      const onControl = document.activeElement?.tagName === "BUTTON";
      if (e.key === " " || e.key === "Enter") {
        if (onControl) return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        prev();
      } else if (e.key === "1") {
        grade("learning");
      } else if (e.key === "2") {
        grade("known");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (cards.length === 0) {
    return (
      <StudyFrame title={title} backHref={backHref} variant={variant}>
        <div className="mx-auto mt-10 max-w-md rounded-card border border-navy/15 bg-white px-6 py-10 text-center">
          <p className="text-sm text-navy/55">This set has no cards to study yet.</p>
          <Link href={backHref} className={`${secondaryBtn} mt-5`}>
            Back to set
          </Link>
        </div>
      </StudyFrame>
    );
  }

  if (phase === "summary") {
    const knownCount = Object.values(results).filter((g) => g === "known").length;
    const learningCount = Object.values(results).filter((g) => g === "learning").length;
    const learningIndices = cards
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => results[c.id] === "learning")
      .map(({ i }) => i);

    return (
      <StudyFrame title={title} backHref={backHref} variant={variant}>
        <div className="mx-auto mt-6 max-w-md animate-pop-in rounded-card border border-navy/15 bg-white p-7 text-center shadow-pop">
          <div className={`${label} text-success-600`}>Round complete</div>
          <h2 className="mt-1 font-display text-3xl font-extrabold text-navy">
            You knew {knownCount} of {total}
          </h2>
          <p className="mt-2 text-sm text-navy/55">
            {learningCount > 0
              ? `${learningCount} ${learningCount === 1 ? "card" : "cards"} to keep practicing.`
              : "Perfect round. Nice work."}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {learningCount > 0 ? (
              <button
                type="button"
                onClick={() => startRun(learningIndices, false)}
                className={accentBtn}
              >
                Review {learningCount} still learning
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => startRun(cards.map((_, i) => i), false)}
              className={learningCount > 0 ? secondaryBtn : accentBtn}
            >
              Study all again
            </button>
            <Link href={backHref} className="mt-1 text-sm font-semibold text-navy/55 hover:text-navy">
              Back to set
            </Link>
          </div>
        </div>
      </StudyFrame>
    );
  }

  const center = (
    <span className="text-sm font-semibold tabular-nums text-navy">
      {pos + 1} <span className="font-normal text-navy/45">/ {total}</span>
    </span>
  );

  const shuffleButton = (
    <button
      type="button"
      onClick={toggleShuffle}
      aria-pressed={shuffled}
      aria-label="Shuffle cards"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-card border px-3 py-1.5 text-sm font-semibold transition-colors ${
        shuffled
          ? "border-brand bg-ice text-brand-600"
          : "border-navy/20 bg-white text-navy/60 hover:text-navy"
      }`}
    >
      <ShuffleIcon className="h-4 w-4" />
      <span className="hidden sm:inline">Shuffle</span>
    </button>
  );

  return (
    <StudyFrame
      title={title}
      backHref={backHref}
      variant={variant}
      center={center}
      right={shuffleButton}
    >
      <div className="mx-auto max-w-2xl">
        <ProgressBar value={pos} max={total} />

        <div className="mt-6 h-72 sm:h-[22rem]" style={{ perspective: "1800px" }}>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Definition shown. Activate to see the term." : "Term shown. Activate to see the definition."}
            className="relative block h-full w-full cursor-pointer text-left transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front — term */}
            <span
              className="absolute inset-0 flex flex-col rounded-[18px] border border-navy/15 bg-white p-6 shadow-pop sm:p-8"
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
            >
              <span className="flex items-center justify-between">
                <span className={`${label} text-navy/40`}>Term</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy/35">
                  <RotateIcon className="h-3.5 w-3.5" /> Flip card
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center justify-center gap-3 overflow-auto px-2 text-center">
                {card.termImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.termImageUrl} alt="" width={800} height={600} className="h-auto max-h-44 w-auto rounded-lg object-contain" />
                )}
                {(card.term || !card.termImageUrl) && (
                  <span className="font-serif text-2xl font-semibold leading-snug text-exam-ink sm:text-[2rem]">
                    <MathText>{card.term || "-"}</MathText>
                  </span>
                )}
              </span>
              <span aria-hidden="true" className="h-4" />
            </span>

            {/* Back — definition */}
            <span
              className="absolute inset-0 flex flex-col rounded-[18px] border border-brand/30 bg-ice/50 p-6 shadow-pop sm:p-8"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <span className="flex items-center justify-between">
                <span className={`${label} text-brand-600`}>Definition</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy/35">
                  <RotateIcon className="h-3.5 w-3.5" /> Flip card
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center justify-center gap-3 overflow-auto px-2 text-center">
                {card.definitionImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.definitionImageUrl} alt="" width={800} height={600} className="h-auto max-h-44 w-auto rounded-lg object-contain" />
                )}
                {(card.definition || !card.definitionImageUrl) && (
                  <span className="font-serif text-xl leading-relaxed text-exam-ink sm:text-2xl">
                    <MathText>{card.definition || "-"}</MathText>
                  </span>
                )}
              </span>
              <span aria-hidden="true" className="h-4" />
            </span>
          </button>
        </div>

        {/* Grade controls */}
        <div className="mt-5 flex items-stretch gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={pos === 0}
            aria-label="Previous card"
            className="grid w-12 shrink-0 cursor-pointer place-items-center rounded-card border border-navy/20 bg-white text-navy/55 transition-colors hover:bg-navy/5 hover:text-navy disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <GradeButton tone="learning" onClick={() => grade("learning")}>
            <RotateIcon className="h-5 w-5" />
            Still learning
          </GradeButton>
          <GradeButton tone="known" onClick={() => grade("known")}>
            <CheckCircleIcon className="h-5 w-5" />
            Got it
          </GradeButton>
        </div>

        <p className="mt-3 text-center text-[12px] text-navy/40">
          Space to flip · 1 Still learning · 2 Got it
        </p>
      </div>
    </StudyFrame>
  );
}

function StudyFrame({
  title,
  backHref,
  variant,
  center,
  right,
  children,
}: {
  title: string;
  backHref: string;
  variant: "default" | "ultimate";
  center?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  if (variant === "ultimate") {
    return (
      <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
        <header className="mb-6 flex flex-wrap items-center gap-4 rounded-[18px] border border-navy/10 bg-white p-4 shadow-pop sm:p-5">
          <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-navy/55 hover:text-navy">← Set</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Studying</p>
            <h1 className="truncate font-display text-xl font-extrabold text-navy">{title}</h1>
          </div>
          {center}
          {right}
        </header>
        {children}
      </div>
    );
  }

  return (
    <DrillShell title={title} eyebrow="Studying" exitHref={backHref} exitLabel="Set" center={center} right={right}>
      {children}
    </DrillShell>
  );
}

function GradeButton({
  tone,
  onClick,
  children,
}: {
  tone: "learning" | "known";
  onClick: () => void;
  children: ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    learning: "border-flag/30 bg-flag-bg text-flag hover:border-flag/50",
    known: "border-success/30 bg-success-bg text-success-600 hover:border-success/50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-card border py-3.5 text-sm font-bold transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
