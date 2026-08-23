"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, ExpandIcon, GripIcon } from "./icons";

const VIEWPORT_GUTTER = 8;

export function clampCalculatorPosition({
  x,
  y,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
}: {
  x: number;
  y: number;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const maxX = Math.max(VIEWPORT_GUTTER, viewportWidth - panelWidth - VIEWPORT_GUTTER);
  const maxY = Math.max(VIEWPORT_GUTTER, viewportHeight - panelHeight - VIEWPORT_GUTTER);
  return {
    x: Math.min(Math.max(VIEWPORT_GUTTER, x), maxX),
    y: Math.min(Math.max(VIEWPORT_GUTTER, y), maxY),
  };
}

// Embeds the Desmos graphing calculator (the same tool used in Bluebook),
// in a draggable, resizable floating panel.
export function CalculatorPanel({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState({ x: VIEWPORT_GUTTER, y: VIEWPORT_GUTTER });
  const [big, setBig] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const clampPosition = useCallback((x: number, y: number) => {
    const bounds = panel.current?.getBoundingClientRect();
    return clampCalculatorPosition({
      x,
      y,
      panelWidth: bounds?.width ?? 0,
      panelHeight: bounds?.height ?? 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    const keepInViewport = () => setPos((current) => clampPosition(current.x, current.y));
    keepInViewport();
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, [big, clampPosition]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos(clampPosition(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }

  return (
    <div
      ref={panel}
      style={{
        left: pos.x,
        top: pos.y,
        width: big ? "min(46rem, calc(100vw - 1rem))" : "min(22rem, calc(100vw - 1rem))",
        maxWidth: "calc(100vw - 1rem)",
        height: big
          ? "min(38rem, calc(100dvh - 1rem))"
          : "min(28rem, calc(100dvh - 1rem))",
        maxHeight: "calc(100dvh - 1rem)",
      }}
      className="fixed z-40 flex resize flex-col overflow-hidden rounded-lg border border-exam-border bg-white shadow-2xl"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex touch-none cursor-grab select-none items-center justify-between border-b border-exam-border bg-exam-chrome px-2 py-1.5 active:cursor-grabbing"
      >
        <span className="text-exam-muted">
          <GripIcon className="h-5 w-5" />
        </span>
        <span className="text-[13px] font-semibold text-exam-ink">Calculator</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setBig((b) => !b)}
            aria-label={big ? "Shrink calculator" : "Expand calculator"}
            className="flex h-7 w-7 items-center justify-center rounded text-exam-muted hover:bg-white hover:text-exam-ink"
          >
            <ExpandIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label="Close calculator"
            className="flex h-7 w-7 items-center justify-center rounded text-exam-muted hover:bg-white hover:text-exam-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <iframe
        src="https://www.desmos.com/calculator"
        title="Desmos graphing calculator"
        className="h-full w-full border-0"
      />
    </div>
  );
}
