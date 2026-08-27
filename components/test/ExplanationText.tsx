/* eslint-disable @next/next/no-img-element */
import { Fragment, type ReactNode } from "react";
import { MathText } from "./MathText";

// Explanations authored in the Explanation Manager can include a pasted
// screenshot (![](url), inserted by the paste-to-upload handler) alongside
// LaTeX. Split on the image marker first, then run each remaining text
// chunk through MathText so everything renders together in one pass. Drop-in
// replacement for a bare <MathText>{explanation}</MathText>.
const IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

export function ExplanationText({ text }: { text: string }): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(IMAGE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      const chunk = text.slice(last, index);
      if (chunk) nodes.push(<Fragment key={key++}><MathText>{chunk}</MathText></Fragment>);
    }
    nodes.push(
      <img
        key={key++}
        src={match[1]}
        alt="Explanation figure"
        width={1200}
        height={800}
        loading="lazy"
        className="my-3 block h-auto max-h-80 w-auto max-w-full rounded-xl border border-navy/10 object-contain"
      />,
    );
    last = index + match[0].length;
  }
  if (last < text.length) {
    const chunk = text.slice(last);
    if (chunk) nodes.push(<Fragment key={key++}><MathText>{chunk}</MathText></Fragment>);
  }
  return <>{nodes}</>;
}
