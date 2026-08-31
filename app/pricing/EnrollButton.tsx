"use client";

import type { ReactNode } from "react";

// Below this width .planGrid collapses to a single column, so the cards stack
// in DOM order and #plans (the section top) lands the reader on Free. Keep in
// sync with the breakpoint in pricing.module.css.
const STACKED_PLANS = "(max-width: 800px)";

export function EnrollButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a
      href="#plans"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const stacked = window.matchMedia(STACKED_PLANS).matches;
        const target = (stacked ? document.getElementById("plan-max") : null)
          ?? document.getElementById("plans");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
