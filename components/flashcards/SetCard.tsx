import Link from "next/link";
import type { FlashcardSet } from "@/lib/flashcards/types";
import { LayersIcon } from "./icons";

function termsLabel(n: number): string {
  return `${n} ${n === 1 ? "term" : "terms"}`;
}

function SharedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-chip border border-gold-600/30 bg-[#fff7e6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-flag">
      Shared
    </span>
  );
}

// A single set tile. `grid` is the library default; `row` is the compact list
// view. `featured` gives Scott's shared sets a gold accent so they stand out.
export function SetCard({
  set,
  href,
  layout = "grid",
  featured = false,
  variant = "default",
}: {
  set: FlashcardSet;
  href: string;
  layout?: "grid" | "row";
  featured?: boolean;
  variant?: "default" | "ultimate";
}) {
  const shared = set.visibility === "shared";

  if (layout === "row") {
    return (
      <Link
        href={href}
        className={`group flex items-center gap-4 border bg-white px-4 py-3 transition-colors ${variant === "ultimate" ? "min-h-16 rounded-xl" : "rounded-card"} ${
          featured
            ? "border-navy/15 border-l-2 border-l-gold hover:bg-gold/[0.06]"
            : "border-navy/15 hover:border-brand/40 hover:bg-ice/40"
        }`}
      >
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-card ${
            featured ? "bg-gold/15 text-gold-600" : "bg-ice text-brand"
          }`}
        >
          <LayersIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-bold text-navy">{set.title}</span>
          <span className="block truncate text-sm text-navy/55">
            {termsLabel(set.cardCount)}
            {set.description ? ` · ${set.description}` : ""}
          </span>
        </span>
        {shared ? <SharedBadge /> : null}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group flex flex-col border bg-white p-5 shadow-pop transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none ${variant === "ultimate" ? "min-h-[210px] rounded-2xl" : "rounded-card"} ${
        featured
          ? "border-navy/15 border-t-2 border-t-gold hover:border-gold/50"
          : "border-navy/15 hover:border-brand/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-11 w-11 place-items-center transition-colors ${variant === "ultimate" ? "rounded-xl" : "rounded-card"} ${
            featured
              ? "bg-gold/15 text-gold-600 group-hover:bg-gold group-hover:text-white"
              : "bg-ice text-brand group-hover:bg-brand group-hover:text-white"
          }`}
        >
          <LayersIcon className="h-5 w-5" />
        </span>
        {shared ? <SharedBadge /> : null}
      </div>
      <h3 className="mt-4 line-clamp-2 font-display text-lg font-extrabold leading-snug text-navy">
        {set.title}
      </h3>
      {set.description ? (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-navy/55">{set.description}</p>
      ) : (
        <p className="mt-1 text-sm italic text-navy/35">No description</p>
      )}
      <div className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-navy/60">
        <LayersIcon className="h-4 w-4 text-navy/35" />
        {termsLabel(set.cardCount)}
      </div>
    </Link>
  );
}
