"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ExplanationText } from "@/components/test/ExplanationText";
import { MathText } from "@/components/test/MathText";
import { CloseIcon } from "@/components/test/icons";
import { drillTitle } from "@/lib/drills/registry";
import { chip, label, secondaryBtn, surface } from "@/components/drills/shared/ui";
import { ProgressOverview } from "@/components/history/ProgressOverview";
import type { HistoryEntry } from "@/lib/drills/progress";
import type { StudentProgress } from "@/lib/progress/types";
import type {
  DrillSlug,
  GrammarContent,
  LetteredChoice,
  ReadingContent,
  TargetedMathContent,
  VocabContent,
} from "@/lib/drills/types";

const ALL = "all";
const LETTERS = ["A", "B", "C", "D"] as const;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fmtDate(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? iso.slice(0, 10) : dateFormatter.format(value);
}

function drillHref(slug: DrillSlug, difficulty: string): string {
  if (slug === "targeted-math") {
    return `/drills/targeted-math?difficulty=${difficulty === "hard" ? "hard" : "medium"}`;
  }
  return `/drills/${slug}`;
}

// One-line preview for the list row.
function preview(e: HistoryEntry): string {
  if (e.drillSlug === "vocab") {
    const c = e.question.content as VocabContent;
    return c.definition || e.question.stem || "Vocabulary question";
  }
  const text = (e.question.stem || e.question.passage || "").trim();
  return text || drillTitle(e.drillSlug);
}

export function HistoryView({
  entries,
  progress,
  variant = "default",
  drillsHref = "/drills",
}: {
  entries: HistoryEntry[];
  progress?: StudentProgress;
  variant?: "default" | "ultimate";
  drillsHref?: string;
}) {
  const [filter, setFilter] = useState<string>(ALL);
  const [open, setOpen] = useState<HistoryEntry | null>(null);

  const hasSavedActivity = Boolean(progress && (
    progress.questions.attempted > 0
    || progress.tests.count > 0
    || progress.lessons.completed > 0
    || progress.drills.sessions > 0
    || progress.drills.uniqueQuestions > 0
  ));

  if (entries.length === 0 && !hasSavedActivity) {
    return (
      <main className={`mx-auto w-full max-w-[1120px] px-6 py-16 text-center ${variant === "ultimate" ? "min-h-[70dvh]" : ""}`}>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ice text-brand">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-navy">No history yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-navy/60">
          Questions you work on in drills, courses, the Question Bank, and tests show up here after you finish them.
        </p>
        <Link href={drillsHref} className={`${secondaryBtn} mt-6 ${variant === "ultimate" ? "min-h-11 rounded-xl" : ""}`}>
          Go to drills
        </Link>
      </main>
    );
  }

  // Filter chips: only drills that actually appear, in a stable order.
  const order: DrillSlug[] = ["grammar", "reading", "targeted-math", "vocab"];
  const present = order.filter((slug) => entries.some((e) => e.drillSlug === slug));
  const shown = filter === ALL ? entries : entries.filter((e) => e.drillSlug === filter);
  const mastered = entries.filter((entry) => entry.mastered).length;
  const masteryRate = entries.length > 0 ? Math.round((mastered / entries.length) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-7">
      <header className="mb-6">
        {variant === "ultimate" && <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-brand-600">Practice analytics</p>}
        <h1 className={`font-display font-extrabold tracking-tight text-navy ${variant === "ultimate" ? "mt-1 text-[32px]" : "text-2xl"}`}>Your history</h1>
        <p className="mt-1 text-sm text-navy/60">
          {entries.length} unique drill question{entries.length === 1 ? "" : "s"} practiced. Tap any to review it.
        </p>
      </header>

      {variant === "ultimate" && progress ? <ProgressOverview progress={progress} variant="history" /> : null}

      {variant === "ultimate" && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HistoryMetric label="Unique drill questions" value={entries.length} />
          <HistoryMetric label="Unique questions mastered" value={mastered} />
          <HistoryMetric label="Unique mastery rate" value={`${masteryRate}%`} wide />
        </div>
      )}

      <div className={`mb-5 flex flex-wrap gap-2 ${variant === "ultimate" ? "rounded-2xl border border-navy/10 bg-white p-3 shadow-pop" : ""}`}>
        <FilterChip active={filter === ALL} text={`All unique (${entries.length})`} onClick={() => setFilter(ALL)} />
        {present.map((slug) => (
          <FilterChip
            key={slug}
            active={filter === slug}
            text={`${drillTitle(slug)} (${entries.filter((e) => e.drillSlug === slug).length})`}
            onClick={() => setFilter(slug)}
          />
        ))}
      </div>

      {shown.length > 0 ? <ul className="space-y-2.5">
        {shown.map((e) => (
          <li key={e.question.id}>
            <button
              type="button"
              onClick={() => setOpen(e)}
              className={`${variant === "ultimate" ? "rounded-2xl border border-navy/10 bg-white shadow-pop" : surface} flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-[background-color,border-color] hover:border-brand/30 hover:bg-ice/20`}
            >
              <span className={`${chip} shrink-0 bg-brand/10 text-brand-600`}>{drillTitle(e.drillSlug)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-navy/80">{preview(e)}</span>
              <StatusPill entry={e} />
              <span className="hidden shrink-0 text-xs text-navy/40 sm:inline">{fmtDate(e.lastSeenAt)}</span>
            </button>
          </li>
        ))}
      </ul> : <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-7 text-center"><h2 className="font-display text-lg font-extrabold text-navy">No drill questions yet</h2><p className="mt-1 text-sm text-navy/50">Your other saved activity is summarized above. Complete a drill answer to add a reviewable question here.</p></div>}

      {open ? <DetailModal entry={open} onClose={() => setOpen(null)} /> : null}
    </main>
  );
}

function HistoryMetric({ label: text, value, wide = false }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-navy/10 bg-white p-4 shadow-pop ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <strong className="font-display text-2xl font-extrabold text-navy">{value}</strong>
      <span className="mt-1 block text-xs text-navy/45">{text}</span>
    </div>
  );
}

function FilterChip({ active, text, onClick }: { active: boolean; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active ? "border-navy bg-navy text-white" : "border-navy/20 bg-white text-navy/70 hover:bg-navy/5"
      }`}
    >
      {text}
    </button>
  );
}

// Green when mastered, amber otherwise. AI drills (grammar/reading) also surface
// the best 0..100 grade; objective drills just show the state.
function StatusPill({ entry }: { entry: HistoryEntry }) {
  const ai = entry.drillSlug === "grammar" || entry.drillSlug === "reading";
  if (entry.mastered) {
    return (
      <span className={`${chip} shrink-0 bg-success-bg text-success-600`}>
        {ai && entry.bestScore != null ? `Mastered · ${entry.bestScore}` : "Mastered"}
      </span>
    );
  }
  return (
    <span className={`${chip} shrink-0 bg-gold/15 text-gold-600`}>
      {ai && entry.bestScore != null ? `Best ${entry.bestScore}` : "In progress"}
    </span>
  );
}

function DetailModal({ entry, onClose }: { entry: HistoryEntry; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-2xl rounded-card border border-navy/15 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-navy/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className={`${chip} bg-brand/10 text-brand-600`}>{drillTitle(entry.drillSlug)}</span>
            <span className={`${chip} bg-navy/5 text-navy/55`}>{entry.question.difficulty}</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill entry={entry} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-card p-1 text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          <QuestionReview entry={entry} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy/10 px-5 py-3.5">
          <span className="text-xs text-navy/45">
            Practiced {entry.attempts} time{entry.attempts === 1 ? "" : "s"} · last {fmtDate(entry.lastSeenAt)}
          </span>
          <Link href={drillHref(entry.drillSlug, entry.question.difficulty)} className={secondaryBtn}>
            Drill this again
          </Link>
        </div>
      </div>
    </div>
  );
}

function QuestionReview({ entry }: { entry: HistoryEntry }) {
  const q = entry.question;
  switch (entry.drillSlug) {
    case "grammar": {
      const c = q.content as GrammarContent;
      return (
        <div className="space-y-4">
          {q.passage ? <Passage text={q.passage} /> : null}
          {q.stem ? <Stem text={q.stem} /> : null}
          <Choices choices={c.choices ?? []} correct={c.correct} />
          {q.explanation ? <Explanation text={q.explanation} /> : null}
        </div>
      );
    }
    case "vocab": {
      const c = q.content as VocabContent;
      const choices: LetteredChoice[] = (c.options ?? []).map((t, i) => ({
        id: (LETTERS[i] ?? "A") as LetteredChoice["id"],
        text: t,
      }));
      return (
        <div className="space-y-4">
          <div>
            <SectionLabel>Definition{c.pos ? ` · ${c.pos}` : ""}</SectionLabel>
            <p className="mt-1 font-serif text-[15px] leading-relaxed text-exam-ink">{c.definition}</p>
          </div>
          <Choices choices={choices} correct={LETTERS[c.correctIndex]} />
        </div>
      );
    }
    case "targeted-math": {
      const c = q.content as TargetedMathContent;
      return (
        <div className="space-y-4">
          <div>
            <SectionLabel>Question</SectionLabel>
            <p className="mt-1 font-serif text-[15px] leading-relaxed text-exam-ink">
              <MathText>{q.stem || q.passage || ""}</MathText>
            </p>
          </div>
          {q.answerType === "mc_single" && c.kind === "mc" ? (
            <Choices choices={c.choices} correct={c.correct} />
          ) : c.kind === "grid" ? (
            <div>
              <SectionLabel>Accepted answer{c.accepted.length > 1 ? "s" : ""}</SectionLabel>
              <p className="mt-1 font-serif text-[15px] font-semibold text-success-600">{c.accepted.join("   ·   ")}</p>
            </div>
          ) : null}
          {q.explanation ? <Explanation text={q.explanation} /> : null}
        </div>
      );
    }
    case "reading": {
      const c = q.content as ReadingContent;
      const body = Array.isArray(c.body) && c.body.length ? c.body.join("\n\n") : q.passage ?? "";
      return (
        <div className="space-y-4">
          {body ? <Passage text={body} /> : null}
          <div>
            <SectionLabel>Key points</SectionLabel>
            <ul className="mt-2 space-y-1.5">
              {(c.keyPoints ?? []).map((p, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug text-navy/80">
                  <span className="text-success-600">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    default:
      return <p className="text-sm text-navy/60">{q.stem || q.passage}</p>;
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={`${label} text-navy/45`}>{children}</div>;
}

function Passage({ text }: { text: string }) {
  return (
    <div>
      <SectionLabel>Passage</SectionLabel>
      <p className="mt-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-exam-ink">{text}</p>
    </div>
  );
}

function Stem({ text }: { text: string }) {
  return (
    <div>
      <SectionLabel>Question</SectionLabel>
      <p className="mt-1 font-serif text-[15px] leading-relaxed text-exam-ink">{text}</p>
    </div>
  );
}

function Choices({ choices, correct }: { choices: LetteredChoice[]; correct?: string }) {
  if (choices.length === 0) return null;
  return (
    <div>
      <SectionLabel>Choices</SectionLabel>
      <ul className="mt-2 space-y-2">
        {choices.map((c) => {
          const right = c.id === correct;
          return (
            <li
              key={c.id}
              className={`flex items-start gap-2.5 rounded-card border px-3 py-2 text-sm ${
                right ? "border-success/40 bg-success-bg" : "border-navy/12 bg-white"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                  right ? "border-success bg-success text-white" : "border-navy/25 text-navy/60"
                }`}
              >
                {c.id}
              </span>
              <span className={`font-serif leading-snug ${right ? "text-success-600" : "text-exam-ink"}`}>{c.text}</span>
              {right ? (
                <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-wide text-success-600">
                  Correct
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Explanation({ text }: { text: string }) {
  return (
    <div className="rounded-card border border-navy/12 bg-navy/[0.02] px-3.5 py-3">
      <SectionLabel>Explanation</SectionLabel>
      <p className="mt-1 text-sm leading-relaxed text-navy/75"><ExplanationText text={text} /></p>
    </div>
  );
}
