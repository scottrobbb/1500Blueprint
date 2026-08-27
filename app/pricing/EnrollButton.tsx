"use client";

import type { ReactNode } from "react";

export function EnrollButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a
      href="#plans"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
