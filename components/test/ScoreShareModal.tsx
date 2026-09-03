"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyNodeAsPng, downloadNodeAsPng } from "@/lib/download-png";
import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  testTitle: string;
  dateLabel?: string;
  total: number;
  rwScore: number;
  mathScore: number;
};

type ShareStatus = "idle" | "copying" | "copied" | "downloading" | "error";

export function ScoreShareModal({
  open,
  onClose,
  testTitle,
  dateLabel,
  total,
  rwScore,
  mathScore,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<ShareStatus>("idle");
  const close = useCallback(() => {
    setStatus("idle");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, close]);

  if (!open) return null;

  async function copyImage() {
    if (!cardRef.current) return;
    setStatus("copying");
    try {
      await copyNodeAsPng(cardRef.current);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  async function downloadImage() {
    if (!cardRef.current) return;
    setStatus("downloading");
    try {
      await downloadNodeAsPng(cardRef.current, `${testTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-score.png`);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-shell-950/55 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-score-title"
        className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <header className="mb-5 flex items-center justify-between">
          <h2 id="share-score-title" className="font-display text-xl font-extrabold text-ink">
            Share your score
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close share score dialog"
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-shell-500 transition-colors hover:bg-shell-100 hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div
          ref={cardRef}
          data-theme="light"
          className="mx-auto aspect-square w-full max-w-[430px] overflow-hidden bg-white text-ink"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-[#143d91] via-[#245ec7] to-[#3288ea] px-5 py-4 text-white">
            <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold tracking-wide">1500 BLUEPRINT</div>
            <div className="text-right">
              <p className="text-sm font-bold">{testTitle}</p>
              {dateLabel ? <p className="text-[11px] text-white/75">{dateLabel}</p> : null}
            </div>
          </div>
          <div className="flex h-[calc(100%-68px)] flex-col items-center justify-center px-6 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-shell-400">Total score</p>
            <p className="mt-1 font-display text-7xl font-black tracking-tight text-shell-950">{total}</p>
            <p className="text-sm font-medium text-shell-400">out of 1600</p>
            <div className="mt-6 grid w-full grid-cols-2 divide-x divide-shell-200 border-y border-shell-200 py-4">
              <div>
                <p className="text-xs font-semibold text-shell-500">Reading &amp; Writing</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-shell-950">{rwScore}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-shell-500">Math</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-shell-950">{mathScore}</p>
              </div>
            </div>
            <p className="mt-5 text-xs font-medium text-shell-400">1500 Blueprint · Practice with a plan</p>
          </div>
        </div>

        <p className="mt-5 text-center text-sm leading-6 text-shell-600">
          Downloads as a square image so your score displays cleanly when you share it.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={copyImage}
            disabled={status === "copying" || status === "downloading"}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-brand-600 px-4 text-sm font-bold text-brand-600 transition-colors hover:bg-ice disabled:cursor-wait disabled:opacity-60"
          >
            <CopyIcon className="h-5 w-5" />
            {status === "copying" ? "Copying…" : status === "copied" ? "Copied" : "Copy image"}
          </button>
          <button
            type="button"
            onClick={downloadImage}
            disabled={status === "copying" || status === "downloading"}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition-colors hover:bg-navy disabled:cursor-wait disabled:opacity-60"
          >
            <DownloadIcon className="h-5 w-5" />
            {status === "downloading" ? "Rendering…" : "Download PNG"}
          </button>
        </div>
        {status === "error" ? (
          <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">
            The image could not be created. Try downloading again.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 4v10m0 0l-4-4m4 4l4-4M5 18h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
