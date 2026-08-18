"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FlashcardSet } from "@/lib/flashcards/types";
import { accentBtn } from "@/components/drills/shared/ui";
import { GlobeIcon, LayersIcon, LockIcon, PlusIcon, SearchIcon } from "@/components/flashcards/icons";

export function AdminSetsList({ sets, basePath = "/admin/sets" }: { sets: FlashcardSet[]; basePath?: string }) {
  const [query, setQuery] = useState("");
  const norm = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sets.filter(
        (s) =>
          !norm ||
          s.title.toLowerCase().includes(norm) ||
          s.ownerEmail.toLowerCase().includes(norm),
      ),
    [sets, norm],
  );
  const sharedCount = sets.filter((s) => s.visibility === "shared").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">
            Flashcard sets
          </h1>
          <p className="mt-1 text-sm text-navy/55">
            {sets.length} {sets.length === 1 ? "set" : "sets"} · {sharedCount} shared with students
          </p>
        </div>
        <Link href={`${basePath}/new`} className={accentBtn}>
          <PlusIcon className="h-4 w-4" />
          New set
        </Link>
      </div>

      <div className="relative mt-6 max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or owner"
          aria-label="Search sets"
          className="w-full rounded-card border border-navy/15 bg-white py-2.5 pl-9 pr-3 text-sm text-navy placeholder:text-navy/35 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-card border border-navy/15 bg-white">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-navy/50">No sets found.</div>
        ) : (
          filtered.map((s) => (
            <Link
              key={s.id}
              href={`${basePath}/${s.id}`}
              className="flex items-center gap-3 border-b border-navy/8 px-4 py-3 transition-colors last:border-0 hover:bg-navy/[0.03]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-ice text-brand">
                <LayersIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy">{s.title}</span>
                <span className="block truncate text-xs text-navy/45">
                  {s.ownerEmail} · {s.cardCount} {s.cardCount === 1 ? "card" : "cards"}
                </span>
              </span>
              {s.visibility === "shared" ? (
                <span className="inline-flex items-center gap-1 rounded-chip border border-gold-600/30 bg-[#fff7e6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-flag">
                  <GlobeIcon className="h-3 w-3" />
                  Shared
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-chip bg-navy/6 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-navy/45">
                  <LockIcon className="h-3 w-3" />
                  Private
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
