"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DrillShell } from "@/components/drills/shared/DrillShell";
import { accentBtn, label, secondaryBtn } from "@/components/drills/shared/ui";
import { MathText } from "@/components/test/MathText";
import { PlayIcon } from "@/components/shell/icons";
import type { FlashcardSetWithCards } from "@/lib/flashcards/types";
import { GlobeIcon, LockIcon, PencilIcon, TrashIcon } from "./icons";

export function SetDetail({
  set,
  editable,
  variant = "default",
  backHref = "/flashcards",
  actionBase = "/flashcards",
}: {
  set: FlashcardSetWithCards;
  editable: boolean;
  variant?: "default" | "ultimate";
  backHref?: string;
  actionBase?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const hasCards = set.cards.length > 0;
  const shared = set.visibility === "shared";

  async function onDelete() {
    if (!confirm("Delete this set? This can't be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/flashcards/sets/${set.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(backHref);
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  const content = (
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className={`animate-rise-in border border-navy/15 bg-white p-6 shadow-pop sm:p-8 ${variant === "ultimate" ? "rounded-[18px]" : "rounded-card"}`}>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                shared
                  ? "border border-gold-600/30 bg-[#fff7e6] text-flag"
                  : "bg-navy/6 text-navy/55"
              }`}
            >
              {shared ? <GlobeIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
              {shared ? "Shared with students" : "Private"}
            </span>
            <span className="text-[13px] font-semibold text-navy/45">
              {set.cards.length} {set.cards.length === 1 ? "term" : "terms"}
            </span>
          </div>

          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-navy">
            {set.title}
          </h1>
          {set.description ? (
            <p className="mt-2 text-[15px] leading-relaxed text-navy/60">{set.description}</p>
          ) : null}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {hasCards ? (
              <Link href={`${actionBase}/${set.id}/study`} className={`${accentBtn} ${variant === "ultimate" ? "min-h-11 rounded-xl px-5" : ""}`}>
                <PlayIcon className="h-4 w-4" />
                Study
              </Link>
            ) : (
              <span className={`${accentBtn} pointer-events-none opacity-40`}>
                <PlayIcon className="h-4 w-4" />
                Study
              </span>
            )}
            {editable ? (
              <Link href={`${actionBase}/${set.id}/edit`} className={`${secondaryBtn} ${variant === "ultimate" ? "min-h-11 rounded-xl" : ""}`}>
                <PencilIcon className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {editable ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className={`ml-auto inline-flex min-h-11 items-center gap-1.5 px-3 py-2 text-sm font-semibold text-navy/50 transition-colors hover:bg-danger-bg hover:text-danger-600 disabled:opacity-40 ${variant === "ultimate" ? "rounded-xl" : "rounded-card"}`}
              >
                <TrashIcon className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Terms */}
        <div className="mt-6">
          <h2 className={`${label} mb-3 text-navy/55`}>Terms in this set</h2>
          {hasCards ? (
            <ul className={`divide-y divide-navy/10 overflow-hidden border border-navy/15 bg-white ${variant === "ultimate" ? "rounded-2xl shadow-pop" : "rounded-card"}`}>
              {set.cards.map((c, i) => (
                <li
                  key={c.id}
                  className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:gap-6"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-[11px] font-bold tabular-nums text-navy/30">{i + 1}</span>
                    <div className="min-w-0">
                      <span className="font-semibold text-navy">
                        <MathText>{c.term}</MathText>
                      </span>
                      {c.termImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.termImageUrl}
                          alt=""
                          className="mt-2 max-h-24 rounded-card border border-navy/15 object-contain"
                        />
                      )}
                    </div>
                  </div>
                  <div className="pl-6 text-navy/70 sm:pl-0">
                    <MathText>{c.definition}</MathText>
                    {c.definitionImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.definitionImageUrl}
                        alt=""
                        className="mt-2 max-h-24 rounded-card border border-navy/15 object-contain"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-card border border-dashed border-navy/20 bg-white px-5 py-10 text-center text-sm text-navy/50">
              This set has no cards yet.
              {editable ? (
                <>
                  {" "}
                  <Link href={`${actionBase}/${set.id}/edit`} className="font-semibold text-brand hover:underline">
                    Add some
                  </Link>
                  .
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
  );

  if (variant === "ultimate") {
    return (
      <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
        <Link href={backHref} className="mb-5 inline-flex min-h-11 items-center text-sm font-bold text-navy/55 hover:text-navy">
          ← Back to flashcards
        </Link>
        {content}
      </div>
    );
  }

  return (
    <DrillShell title={set.title} eyebrow="Flashcard set" exitHref={backHref} exitLabel="Library">
      {content}
    </DrillShell>
  );
}
