"use client";

import { useState } from "react";
import { KebabIcon, PinIcon, TrashIcon } from "./icons";

// Shared kebab dropdown for a post's header — used by both PostCard (list)
// and PostDetail. Owns its own open/closed state so call sites don't have to.
export function PostMenu({
  canDelete,
  onDelete,
  isAdmin,
  pinned,
  onTogglePin,
}: {
  canDelete: boolean;
  onDelete: () => void;
  isAdmin: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canDelete && !isAdmin) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-navy/40 transition-colors hover:bg-navy/[0.06] hover:text-navy"
      >
        <KebabIcon className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-navy/12 bg-white shadow-xl"
          >
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onTogglePin();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-navy transition-colors hover:bg-navy/[0.05]"
              >
                <PinIcon className="h-[17px] w-[17px]" />
                {pinned ? "Unpin post" : "Pin post"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger-bg"
              >
                <TrashIcon className="h-[17px] w-[17px]" />
                Delete post
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
