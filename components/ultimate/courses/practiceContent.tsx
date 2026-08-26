/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { MathText } from "@/components/test/MathText";

// Explanations can mix LaTeX with pasted-image markdown (![](url) inserted by
// the admin editor's paste-to-upload). Split on the image syntax first, then
// run each remaining text chunk through MathText so both render correctly.
export function renderPracticeExplanation(text: string): ReactNode {
  const parts = text.split(/!\[[^\]]*\]\(([^)]+)\)/g);
  return parts.map((part, index) => index % 2 === 1
    ? <img key={index} src={part} alt="Explanation figure" className="my-3 max-h-80 w-auto max-w-full rounded-xl border border-navy/10 object-contain" />
    : part
      ? <span key={index} className="whitespace-pre-wrap"><MathText>{part}</MathText></span>
      : null);
}
