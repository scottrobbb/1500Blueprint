"use client";

import type { GradedReadingPoint } from "@/lib/drills/readingGrading";
import { CheckIcon } from "@/components/test/icons";
import { surface } from "../shared/ui";

// --- Phase 1: timed reading ---------------------------------------------------

// The passage sits alone in a centered, generously set serif card so the read
// is calm and focused. A "Done Reading" button ends the read early.
export function ReadingCard({ body, onDone }: { body: string[]; onDone: () => void }) {
  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      <article className={`${surface} px-6 py-8 sm:px-10 sm:py-11`}>
        <div className="space-y-5">
          {body.map((para, i) => (
            <p key={i} className="font-serif text-[17px] leading-[1.85] text-exam-ink">
              {para}
            </p>
          ))}
        </div>
      </article>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center gap-2 rounded-card bg-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
        >
          <CheckIcon className="h-4 w-4" />
          Done Reading
        </button>
      </div>
    </div>
  );
}

// --- Phase 2: recall heading --------------------------------------------------

// The prompt card above the summary box. Mirrors the reference copy and uses an
// open-book glyph in a squared brand tile.
export function RecallHeading() {
  return (
    <div className={`${surface} flex items-start gap-3.5 p-4 sm:p-5`}>
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-chip border border-brand/20 bg-brand/10 text-brand">
        <BookIcon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Summarize what you just read</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-navy/55">
          The passage is gone. Write everything you remember.
        </p>
      </div>
    </div>
  );
}

// --- Phase 3 (feedback): the two-tier points breakdown ------------------------

// What the recall left on the table, split into the two tiers the score weights:
// Core is the main idea and resolution (80% of the score), Depth is the
// supporting layer (20%). Fully recalled points are not listed — the student
// only needs to see what they lost.
export function MissedPoints({
  core,
  depth,
}: {
  core: GradedReadingPoint[];
  depth: GradedReadingPoint[];
}) {
  const missedCore = core.filter((p) => p.recall !== "full");
  const missedDepth = depth.filter((p) => p.recall !== "full");

  if (missedCore.length === 0 && missedDepth.length === 0) {
    return (
      <div className={`${surface} border-success/30 bg-success-bg/40 flex items-start gap-3 px-4 py-4`}>
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-chip bg-success-bg text-success-600">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="font-display text-[15px] font-bold text-ink">You captured every point</h3>
          <p className="mt-0.5 text-sm text-navy/60">
            Main idea, timeline, and all the supporting detail.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${surface} border-danger/30 bg-danger-bg/25`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-danger/15 px-4 py-3">
        <h3 className="font-display text-[15px] font-bold text-ink">Points you missed</h3>
        <span className="text-xs font-semibold tabular-nums text-navy/55">
          Core {core.length - missedCore.length}/{core.length} · Depth{" "}
          {depth.length - missedDepth.length}/{depth.length}
        </span>
      </div>
      <div className="divide-y divide-danger/12">
        <PointGroup
          heading="Core"
          note="The main idea and resolution — most of your score."
          points={missedCore}
        />
        <PointGroup
          heading="Depth"
          note="Supporting detail that fills the idea in."
          points={missedDepth}
        />
      </div>
    </div>
  );
}

function PointGroup({
  heading,
  note,
  points,
}: {
  heading: string;
  note: string;
  points: GradedReadingPoint[];
}) {
  if (points.length === 0) return null;
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-[13px] font-bold text-navy">{heading}</h4>
        <span className="text-xs text-navy/50">{note}</span>
      </div>
      <ul className="mt-2 space-y-2">
        {points.map((point, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-chip ${
                point.recall === "partial"
                  ? "bg-flag-bg text-flag"
                  : "bg-danger-bg text-danger-600"
              }`}
            >
              {point.recall === "partial" ? (
                <HalfIcon className="h-2.5 w-2.5" />
              ) : (
                <XMarkIcon className="h-2.5 w-2.5" />
              )}
            </span>
            <span className="font-serif text-[15px] leading-snug text-exam-ink">
              <span className="font-sans text-[13px] font-semibold text-navy/70">
                {point.label}:
              </span>{" "}
              {point.text}
              {point.recall === "partial" ? (
                <span className="ml-1.5 text-xs font-semibold text-flag">partly captured</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Local icons --------------------------------------------------------------

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 6.5C10.5 5.2 8.3 4.8 5.5 5.2A1 1 0 0 0 4.7 6.2v11a1 1 0 0 0 1.1 1c2.6-.3 4.7 0 6.2 1.3 1.5-1.3 3.6-1.6 6.2-1.3a1 1 0 0 0 1.1-1v-11a1 1 0 0 0-.8-1C15.7 4.8 13.5 5.2 12 6.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 6.5V19" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

function HalfIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}
