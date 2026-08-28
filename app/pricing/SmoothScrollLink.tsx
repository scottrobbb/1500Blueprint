"use client";

import type { ReactNode } from "react";

export function SmoothScrollLink({
  href,
  children,
  className,
}: {
  href: `#${string}`;
  children: ReactNode;
  className?: string;
}) {
  const targetId = href.slice(1);
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
