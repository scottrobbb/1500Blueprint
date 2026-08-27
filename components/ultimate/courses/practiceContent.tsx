/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { MathText } from "@/components/test/MathText";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";

// Explanations can mix LaTeX with pasted-image markdown (![](url), inserted
// by the admin editor's paste-to-upload), uploaded audio ([[audio:url]]),
// and an embedded Vimeo video ([[vimeo:url]]). Split on all three media
// markers first, then run each remaining text chunk through MathText so
// everything renders together in one pass.
const MEDIA_RE = /!\[[^\]]*\]\(([^)]+)\)|\[\[audio:([^\]]+)\]\]|\[\[vimeo:([^\]]+)\]\]/g;

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
    const [, imageUrl, audioUrl, vimeoUrl] = match;
    if (imageUrl !== undefined) {
      nodes.push(<img key={key++} src={imageUrl} alt="Explanation figure" width={1200} height={800} loading="lazy" className="my-3 h-auto max-h-80 w-auto max-w-full rounded-xl border border-navy/10 object-contain" />);
    } else if (audioUrl !== undefined) {
      nodes.push(<audio key={key++} controls src={audioUrl} className="my-3 w-full max-w-md" />);
    } else if (vimeoUrl !== undefined) {
      const embedUrl = vimeoEmbedUrl(vimeoUrl);
      nodes.push(
        embedUrl ? (
          <div key={key++} className="my-3 aspect-video w-full max-w-lg overflow-hidden rounded-xl border border-navy/10 bg-navy">
            <iframe
              src={embedUrl}
              title="Explanation video"
              loading="lazy"
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-fullscreen"
            />
          </div>
        ) : (
          <span key={key++} className="my-3 block text-xs font-semibold text-danger-600">This Vimeo link couldn&rsquo;t be embedded.</span>
        ),
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) {
    const chunk = text.slice(last);
    if (chunk) nodes.push(<span key={key++} className="whitespace-pre-wrap"><MathText>{chunk}</MathText></span>);
  }
  return nodes;
}
