/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { MathText } from "@/components/test/MathText";

// Explanations can mix LaTeX with pasted-image markdown (![](url), inserted
// by the admin editor's paste-to-upload) and uploaded audio ([[audio:url]]).
// Split on both media markers first, then run each remaining text chunk
// through MathText so all three render correctly together.
const MEDIA_RE = /!\[[^\]]*\]\(([^)]+)\)|\[\[audio:([^\]]+)\]\]/g;

export function renderPracticeExplanation(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(MEDIA_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      const chunk = text.slice(last, index);
      if (chunk) nodes.push(<span key={key++} className="whitespace-pre-wrap"><MathText>{chunk}</MathText></span>);
    }
    const [, imageUrl, audioUrl] = match;
    if (imageUrl !== undefined) {
      nodes.push(<img key={key++} src={imageUrl} alt="Explanation figure" className="my-3 max-h-80 w-auto max-w-full rounded-xl border border-navy/10 object-contain" />);
    } else if (audioUrl !== undefined) {
      nodes.push(<audio key={key++} controls src={audioUrl} className="my-3 w-full max-w-md" />);
    }
    last = index + match[0].length;
  }
  if (last < text.length) {
    const chunk = text.slice(last);
    if (chunk) nodes.push(<span key={key++} className="whitespace-pre-wrap"><MathText>{chunk}</MathText></span>);
  }
  return nodes;
}
