"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DrillShell } from "../shared/DrillShell";
import { ProgressBar } from "../shared/Hud";
import { label, primaryBtn, secondaryBtn, surface } from "../shared/ui";
import { SlidersIcon } from "../shared/icons";
import { DECK, DUE_COUNT, type Flashcard } from "./mock";

type Phase = "overview" | "review" | "summary";
type Rating = "again" | "good" | "easy";
type ReviewFlashcard = Flashcard & { prioritized?: boolean };

export function FlashcardsDrill({
  deck,
  manageHref = "/flashcards",
  returnHref = "/drills",
}: {
  deck?: ReviewFlashcard[];
  manageHref?: string;
  returnHref?: string;
}) {
  const cards: ReviewFlashcard[] = deck ?? DECK;
  const dueCount = deck ? deck.length : DUE_COUNT;

  const [phase, setPhase] = useState<Phase>("overview");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const card = cards[index];

  function start() {
    setPhase("review");
    setIndex(0);
    setRevealed(false);
    setReviewed(0);
  }

  function rate(rating: Rating) {
    void rating;
    const next = index + 1;
    setReviewed((n) => n + 1);
    if (next >= cards.length) {
      setPhase("summary");
    } else {
      setIndex(next);
      setRevealed(false);
    }
  }

  if (phase === "overview") {
    return (
      <DrillShell title="Vocab Flashcards" eyebrow="Vocabulary" exitHref={returnHref}>
        <Overview
          onStart={start}
          deckSize={cards.length}
          dueCount={dueCount}
          prioritizedCount={cards.filter((card) => card.prioritized).length}
          manageHref={manageHref}
        />
      </DrillShell>
    );
  }

  if (phase === "summary") {
    return (
      <DrillShell title="Vocab Flashcards" eyebrow="Vocabulary" exitHref={returnHref}>
        <div className={`animate-pop-in mx-auto mt-8 max-w-md ${surface} px-6 py-7 text-center`}>
          <div className={`${label} text-success-600`}>Review complete</div>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">
            Reviewed {reviewed} cards
          </h2>
          <p className="mt-2 text-sm text-navy/55">
            Cards you found hard will come back sooner on your next review.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={start} className={primaryBtn}>
              Review again
            </button>
            <Link href={returnHref} className={secondaryBtn}>
              Back to drills
            </Link>
          </div>
        </div>
      </DrillShell>
    );
  }

  const center = (
    <span className="text-sm font-semibold tabular-nums text-navy">
      {index + 1} <span className="font-normal text-navy/45">/ {cards.length}</span>
    </span>
  );

  return (
    <DrillShell title="Vocab Flashcards" eyebrow="Vocabulary" exitHref={returnHref} center={center}>
      <div className="mx-auto max-w-2xl">
        <ProgressBar value={index} max={cards.length} />
        <ReviewCard card={card} revealed={revealed} onReveal={() => setRevealed(true)} onRate={rate} />
      </div>
    </DrillShell>
  );
}

function Overview({
  onStart,
  deckSize,
  dueCount,
  prioritizedCount,
  manageHref,
}: {
  onStart: () => void;
  deckSize: number;
  dueCount: number;
  prioritizedCount: number;
  manageHref: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className={`${surface} p-6`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat value={String(deckSize)} unit="cards in deck" />
          <span className="hidden h-8 w-px bg-navy/12 sm:block" />
          <Stat value={String(dueCount)} unit="due for review" />
          <span className="hidden h-8 w-px bg-navy/12 sm:block" />
          <Stat value={String(prioritizedCount)} unit="bookmarked first" />
        </div>
      </div>

      <div className={`mt-4 ${surface}`}>
        <div className="border-b border-navy/10 px-5 py-3">
          <h3 className={`${label} text-navy/55`}>How it works</h3>
        </div>
        <ol className="space-y-3 px-5 py-4 text-sm text-navy/70">
          <Step n={1} text="See a word, then try to recall its meaning from memory." />
          <Step n={2} text="Reveal the definition and an example sentence to check yourself." />
          <Step n={3} text="Rate how well you knew it. Harder cards return sooner; easy ones wait longer." />
          <Step n={4} text="Words you bookmark in the Vocab Drill always appear before imported and auto-added cards." />
        </ol>
      </div>

      <CsvImportPanel />

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onStart} disabled={deckSize === 0} className={`${primaryBtn} disabled:cursor-not-allowed disabled:opacity-45`}>
          Start review
        </button>
        <Link href={manageHref} className={secondaryBtn}>
          <SlidersIcon className="h-4 w-4" />
          Manage deck
        </Link>
      </div>
      {deckSize === 0 ? (
        <p className="mt-4 rounded-card border border-navy/10 bg-white px-4 py-3 text-sm text-navy/55">
          Your deck is empty. Save a word in the Vocab Drill, or turn on auto-add so missed words appear here.
        </p>
      ) : null}
    </div>
  );
}

function ReviewCard({
  card,
  revealed,
  onReveal,
  onRate,
}: {
  card: ReviewFlashcard;
  revealed: boolean;
  onReveal: () => void;
  onRate: (r: Rating) => void;
}) {
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={revealed ? undefined : onReveal}
        className={`flex min-h-[15rem] w-full flex-col items-center justify-center rounded-card border border-navy/15 bg-white px-6 py-10 text-center transition-colors ${
          revealed ? "cursor-default" : "cursor-pointer hover:border-navy/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <div className={`${label} text-navy/40`}>Term</div>
          {card.prioritized ? (
            <span className="rounded-chip bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-gold-600">
              Bookmarked first
            </span>
          ) : null}
        </div>
        <div className="mt-2 font-serif text-4xl font-bold text-exam-ink">{card.word}</div>
        {revealed ? (
          <div className="animate-fade-in mt-5 w-full max-w-md border-t border-navy/10 pt-5">
            <div className="font-serif text-[15px] text-exam-ink">
              <span className="italic text-navy/50">{card.pos}</span> {card.definition}
            </div>
            <p className="mt-3 font-serif text-sm italic leading-relaxed text-navy/55">
              {card.example}
            </p>
          </div>
        ) : (
          <div className="mt-3 text-sm text-navy/40">Click to reveal the definition</div>
        )}
      </button>

      {revealed ? (
        <div className="animate-fade-in mt-4 grid grid-cols-3 gap-3">
          <RateButton tone="danger" labelText="Again" hint="soon" onClick={() => onRate("again")} />
          <RateButton tone="navy" labelText="Good" hint="later" onClick={() => onRate("good")} />
          <RateButton tone="success" labelText="Easy" hint="much later" onClick={() => onRate("easy")} />
        </div>
      ) : null}
    </div>
  );
}

type ImportResponse = {
  ok?: boolean;
  imported?: number;
  inserted?: number;
  updated?: number;
  error?: string;
  errors?: string[];
  errorCount?: number;
};

function CsvImportPanel() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/drills/vocab/flashcards/import", {
        method: "POST",
        body: new FormData(form),
      });
      const body = (await response.json()) as ImportResponse;
      setResult(body);
      if (response.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setResult({ error: "The CSV could not be uploaded. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="relative mt-4 overflow-hidden rounded-card border border-brand/20 bg-[linear-gradient(135deg,#f7fbff_0%,#eef6ff_100%)] p-5">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-chip bg-brand px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">CSV</span>
            <h3 className="font-display text-lg font-bold text-navy">Import your own flashcards</h3>
          </div>
          <p className="mt-2 text-sm leading-5 text-navy/55">
            Use columns <strong>word</strong> and <strong>definition</strong>. <strong>pos</strong> and <strong>example</strong> are optional.
          </p>
        </div>
      </div>
      <form onSubmit={importCsv} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          required
          accept=".csv,text/csv"
          aria-label="Flashcard CSV file"
          className="min-w-0 flex-1 rounded-card border border-brand/20 bg-white px-3 py-2 text-sm text-navy file:mr-3 file:rounded-chip file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-navy px-5 py-3 text-sm font-bold text-white shadow-[0_2px_0_#07193b] transition-transform active:translate-y-px disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? "Importing..." : "Import cards"}
        </button>
      </form>
      {result?.ok ? (
        <p role="status" className="mt-3 text-sm font-semibold text-success-600">
          Imported {result.imported} cards; {result.inserted} new; {result.updated} updated
        </p>
      ) : null}
      {result?.error ? (
        <div role="alert" className="mt-3 text-sm text-danger-600">
          <p className="font-semibold">{result.error}</p>
          {result.errors?.length ? (
            <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5 text-xs">
              {result.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RateButton({
  tone,
  labelText,
  hint,
  onClick,
}: {
  tone: "danger" | "navy" | "success";
  labelText: string;
  hint: string;
  onClick: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    danger: "border-danger/30 text-danger-600 hover:bg-danger-bg",
    navy: "border-navy/25 text-navy hover:bg-navy/5",
    success: "border-success/30 text-success-600 hover:bg-success-bg",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-card border bg-white px-3 py-2.5 text-sm font-semibold transition-colors ${tones[tone]}`}
    >
      {labelText}
      <span className="mt-0.5 text-[11px] font-normal text-navy/40">{hint}</span>
    </button>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-chip border border-navy/20 text-[11px] font-bold tabular-nums text-navy/60">
        {n}
      </span>
      <span className="leading-snug">{text}</span>
    </li>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-extrabold tabular-nums text-navy">{value}</div>
      <div className="text-xs text-navy/50">{unit}</div>
    </div>
  );
}
