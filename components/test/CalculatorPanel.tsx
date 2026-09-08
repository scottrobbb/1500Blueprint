"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

const MIN_DOCK_WIDTH = 320;
const DEFAULT_DOCK_WIDTH = 420;
// The question keeps the larger share: a calculator wide enough to swallow the
// passage would recreate the problem docking is here to solve.
const MAX_DOCK_FRACTION = 0.55;

export function clampCalculatorWidth(width: number, viewportWidth: number): number {
  const ceiling = Math.max(MIN_DOCK_WIDTH, Math.floor(viewportWidth * MAX_DOCK_FRACTION));
  return Math.min(Math.max(MIN_DOCK_WIDTH, Math.round(width)), ceiling);
}

// The Desmos graphing calculator, docked to the left the way Bluebook does it.
//
// It used to float over the page, which meant it covered the question: students
// minimised it to read the stem, and at that size Desmos' own on-screen keyboard
// covered the expression list they were typing into. Docking removes both
// problems at once -- the question sits beside the calculator instead of behind
// it, and a full-height panel has room for the keyboard.
//
// The page is moved aside by padding the body rather than by every host laying
// itself out around this, so the five runners that mount it need to know
// nothing. Modals stay full-bleed on purpose: they are meant to cover this.
export function CalculatorPanel({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState(DEFAULT_DOCK_WIDTH);
  const [resizing, setResizing] = useState(false);
  const dragging = useRef(false);

  const applyWidth = useCallback((next: number) => {
    setWidth(clampCalculatorWidth(next, window.innerWidth));
  }, []);

  // Re-clamped from the current width rather than a captured one, so shrinking
  // the window narrows the dock instead of leaving it wider than its share.
  useEffect(() => {
    const onResize = () => setWidth((current) => clampCalculatorWidth(current, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The dock width lives on the root so the stylesheet can shift the page with
  // it, and both are cleared on unmount so closing the calculator always gives
  // the space back -- including when a runner unmounts with it still open.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--calculator-dock", `${width}px`);
    document.body.classList.add("calculator-docked");
    return () => {
      root.style.removeProperty("--calculator-dock");
      document.body.classList.remove("calculator-docked");
    };
  }, [width]);

  function startResize(event: React.PointerEvent) {
    dragging.current = true;
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onResizeMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    applyWidth(event.clientX);
  }
  function endResize(event: React.PointerEvent) {
    dragging.current = false;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  return (
    <aside
      aria-label="Calculator"
      className="fixed left-0 top-0 z-40 flex h-dvh w-full flex-col border-r border-exam-border bg-white shadow-xl md:w-[var(--calculator-dock)]"
    >
      <div className="flex flex-none items-center justify-between border-b border-exam-border bg-exam-chrome px-3 py-1.5">
        <span className="text-[13px] font-semibold text-exam-ink">Calculator</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculator"
          className="flex h-7 w-7 items-center justify-center rounded text-exam-muted hover:bg-white hover:text-exam-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <iframe
        src="https://www.desmos.com/calculator"
        title="Desmos graphing calculator"
        // The iframe would otherwise swallow the pointer the moment the drag
        // crossed into it, leaving the handle stuck mid-resize.
        style={{ pointerEvents: resizing ? "none" : undefined }}
        className="h-full w-full border-0"
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize calculator"
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-exam-border md:block"
      />
    </aside>
  );
}
