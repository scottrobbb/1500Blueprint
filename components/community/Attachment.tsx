"use client";

import { useEffect, useState } from "react";
import type { PostShot } from "@/lib/community/types";
import { ExpandIcon, CloseIcon } from "./icons";

// An uploaded screenshot attached to a post.
// - "thumb" (feed list): a small fixed square, cropped to fill — a decorative
//   preview docked beside the post text, Skool-style.
// - "full" (post detail): a compact clickable preview, cropped to fill like
//   Skool — the uncropped original only shows once the user opens the lightbox,
//   so score numbers etc. are never lost, just not visible until clicked.
export function Attachment({ shot, variant }: { shot: PostShot; variant: "thumb" | "full" }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  if (variant === "thumb") {
    return (
      <div className="h-20 w-20 flex-none overflow-hidden rounded-[10px] border border-navy/12 bg-haze">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.url} alt={shot.alt} width={320} height={320} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group relative mt-3 h-44 w-44 flex-none overflow-hidden rounded-[14px] border border-navy/12 bg-haze"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.url} alt={shot.alt} width={320} height={320} loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-navy/0 transition-colors group-hover:bg-navy/35">
          <span className="flex items-center gap-1.5 rounded-full bg-navy/70 px-3 py-1.5 text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ExpandIcon className="h-3.5 w-3.5" />
            View image
          </span>
        </span>
      </button>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close image"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.url}
            alt={shot.alt}
            width={1600}
            height={1200}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
