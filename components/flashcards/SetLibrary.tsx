"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { FlashcardSet } from "@/lib/flashcards/types";
import { accentBtn, label } from "@/components/drills/shared/ui";
import { SparkIcon } from "@/components/drills/shared/icons";
import { SetCard } from "./SetCard";
import { GridIcon, LayersIcon, ListIcon, PlusIcon, SearchIcon } from "./icons";

type View = "grid" | "list";
type LibraryVariant = "default" | "ultimate";

export function SetLibrary({
  owned,
  shared,
  variant = "default",
  hrefBase = "/flashcards",
  createHref = "/flashcards/new",
}: {
  owned: FlashcardSet[];
  shared: FlashcardSet[];
  variant?: LibraryVariant;
  hrefBase?: string;
  createHref?: string;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");

  const norm = query.trim().toLowerCase();
  const { ownedF, sharedF } = useMemo(() => {
    const match = (s: FlashcardSet) =>
      !norm ||
      s.title.toLowerCase().includes(norm) ||
      (s.description ?? "").toLowerCase().includes(norm);
    return { ownedF: owned.filter(match), sharedF: shared.filter(match) };
  }, [owned, shared, norm]);

  return (
    <div className={variant === "ultimate" ? "rounded-[18px] border border-navy/10 bg-white p-5 shadow-pop sm:p-7" : ""}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {variant === "ultimate" && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-brand-600">Your study library</p>
          )}
          <h1 className={`font-display font-extrabold tracking-tight text-navy ${variant === "ultimate" ? "text-[30px]" : "text-3xl"}`}>Flashcards</h1>
          <p className="mt-1 text-sm text-navy/55">
            Study the sets your tutor shares, and build your own.
          </p>
        </div>
        <Link href={createHref} className={`${accentBtn} ${variant === "ultimate" ? "min-h-11 rounded-xl px-5" : ""}`}>
          <PlusIcon className="h-4 w-4" />
          Create set
        </Link>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sets"
            aria-label="Search sets"
            className={`w-full border border-navy/15 bg-white py-2.5 pl-9 pr-3 text-sm text-navy placeholder:text-navy/35 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 ${variant === "ultimate" ? "min-h-11 rounded-xl bg-haze/45" : "rounded-card"}`}
          />
        </div>
        <div className={`flex items-center border border-navy/15 bg-white p-0.5 ${variant === "ultimate" ? "rounded-xl" : "rounded-card"}`}>
          <ViewToggle active={view === "grid"} onClick={() => setView("grid")} label="Grid view">
            <GridIcon className="h-4 w-4" />
          </ViewToggle>
          <ViewToggle active={view === "list"} onClick={() => setView("list")} label="List view">
            <ListIcon className="h-4 w-4" />
          </ViewToggle>
        </div>
      </div>

      {/* From your tutor — featured, shown first so Scott's sets lead */}
      {shared.length > 0 ? (
        <section className={`mt-7 border border-gold-600/25 bg-gold/[0.05] p-4 sm:p-5 ${variant === "ultimate" ? "rounded-2xl" : "rounded-card"}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-gold/20 text-gold-600">
              <SparkIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold leading-tight text-navy">
                From your tutor
              </h2>
              <p className="text-xs text-navy/55">
                Curated sets shared by Scott — a great place to start.
              </p>
            </div>
            <span className="ml-auto rounded-chip bg-gold/20 px-2 py-0.5 text-[11px] font-bold tabular-nums text-gold-600">
              {shared.length}
            </span>
          </div>
          {sharedF.length === 0 ? (
            <NoMatches />
          ) : (
            <SetGrid sets={sharedF} view={view} hrefBase={hrefBase} featured variant={variant} />
          )}
        </section>
      ) : null}

      {/* Your sets */}
      <Section title="Your sets" count={owned.length}>
        {owned.length === 0 ? (
          <EmptyState createHref={createHref} />
        ) : ownedF.length === 0 ? (
          <NoMatches />
        ) : (
          <SetGrid sets={ownedF} view={view} hrefBase={hrefBase} variant={variant} />
        )}
      </Section>
    </div>
  );
}

function SetGrid({
  sets,
  view,
  hrefBase,
  featured = false,
  variant,
}: {
  sets: FlashcardSet[];
  view: View;
  hrefBase: string;
  featured?: boolean;
  variant: LibraryVariant;
}) {
  if (view === "list") {
    return (
      <div className="stagger flex flex-col gap-2">
        {sets.map((s) => (
          <SetCard key={s.id} set={s} href={`${hrefBase}/${s.id}`} layout="row" featured={featured} variant={variant} />
        ))}
      </div>
    );
  }
  return (
    <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((s) => (
        <SetCard key={s.id} set={s} href={`${hrefBase}/${s.id}`} featured={featured} variant={variant} />
      ))}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-center gap-2">
        <h2 className={`${label} text-navy/55`}>{title}</h2>
        <span className="rounded-chip bg-navy/6 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-navy/50">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function ViewToggle({
  active,
  onClick,
  label: aria,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      aria-pressed={active}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-[2px] transition-colors ${
        active ? "bg-navy text-white" : "text-navy/45 hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ createHref }: { createHref: string }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-navy/20 bg-white px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-card bg-ice text-brand">
        <LayersIcon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold text-navy">No sets yet</h3>
      <p className="mt-1 max-w-sm text-sm text-navy/55">
        Create your first flashcard set to start studying terms and definitions your way.
      </p>
      <Link href={createHref} className={`${accentBtn} mt-5`}>
        <PlusIcon className="h-4 w-4" />
        Create your first set
      </Link>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="rounded-card border border-navy/15 bg-white px-5 py-8 text-center text-sm text-navy/50">
      No sets match your search.
    </div>
  );
}
