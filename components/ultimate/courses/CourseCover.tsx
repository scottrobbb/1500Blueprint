"use client";

import { useState } from "react";

type CourseCoverProps = {
  src: string | null;
  title: string;
  eyebrow?: string | null;
  className?: string;
  priority?: boolean;
  // Banner mode (default) reserves its own 16:7 box and positions itself
  // relative. Fill mode has no intrinsic aspect ratio and positions itself
  // absolutely against the nearest positioned ancestor, so it crops to that
  // box edge-to-edge.
  //
  // Fill mode must own `absolute` rather than take it from className. Tailwind
  // emits `.relative` after `.absolute`, so with both applied at equal
  // specificity `relative` wins no matter which order the caller writes them
  // in. A root that hardcoded `relative` therefore silently beat a caller
  // passing `absolute inset-0`, leaving the cover in flow: inset by the
  // parent's padding, with the parent's background showing as a margin and
  // any following overlay content pushed below the image instead of over it.
  fill?: boolean;
  // Some cover art is a small centered badge on a large background instead
  // of full-bleed art; scaling the image up crops that dead space away so
  // the subject fills the card. 1 = no zoom (the default).
  zoom?: number;
};

export function CourseCover({ src, title, eyebrow, className = "", fill = false, zoom = 1, priority = false }: CourseCoverProps) {
  const normalizedSrc = src?.trim() ?? "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <div className={`overflow-hidden bg-[#edf2f7] ${fill ? "absolute inset-0" : "relative aspect-[16/7]"} ${className}`}>
      {normalizedSrc && failedSrc !== normalizedSrc ? (
        // Admins can use any HTTPS image host, so this intentionally bypasses Next's fixed remote host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normalizedSrc}
          alt=""
          width={1600}
          height={700}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={() => setFailedSrc(normalizedSrc)}
          style={{ "--cover-zoom": zoom } as React.CSSProperties}
          className="h-full w-full origin-center object-cover transition-transform duration-300 [transform:scale(var(--cover-zoom))] group-hover:[transform:scale(calc(var(--cover-zoom)*1.015))]"
        />
      ) : (
        <CourseCoverFallback title={title} eyebrow={eyebrow} />
      )}
    </div>
  );
}

function CourseCoverFallback({ title, eyebrow }: { title: string; eyebrow?: string | null }) {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "SAT";

  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center gap-4 px-5 sm:px-6">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-brand" />
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-brand/15 bg-white font-display text-base font-semibold tracking-[-0.03em] text-brand-700 shadow-sm">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
          {eyebrow?.trim() || "1500 Blueprint"}
        </span>
        <span className="mt-1 line-clamp-2 block max-w-sm font-display text-lg font-semibold leading-tight tracking-[-0.025em] text-navy">
          {title}
        </span>
      </span>
      <svg viewBox="0 0 160 96" className="absolute -right-2 top-1/2 h-24 w-40 -translate-y-1/2 text-navy/[0.06]" fill="none" aria-hidden="true">
        <path d="M12 18h136M12 48h136M12 78h136" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
      </svg>
    </div>
  );
}
