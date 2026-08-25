import katex from "katex";
import { Fragment, type ReactNode } from "react";
import { parseUnderlineMarkup } from "@/lib/sat/formattedText";

// Renders question text with inline LaTeX. Math between $...$ is typeset with
// KaTeX (print-quality, synchronous); safe <u>...</u> pairs render as underlined
// text, while every other HTML-like string stays plain text.
//
// Legacy fallback: some imported practice-test content writes exponents with a
// bare caret ("a^x", "x^(3/2)") WITHOUT $...$ delimiters. Those plain-text
// segments still render the caret form as a real <sup>. Inside $...$, KaTeX
// handles exponents itself, so the fallback only touches non-math text.

const EXPONENT_RE = /\^(\([^)]*\)|[+−-]?[A-Za-z0-9]+)/g;
// Accept the delimiters used across both imported question banks and the
// hand-authored CMS. Display math must be matched before inline dollars so a
// `$$...$$` block is not misread as stray literal dollar signs.
const MATH_RE = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;

export type MathSegment = { type: "text" | "math"; value: string; display?: boolean };

export function parseMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: text.slice(last, index).replace(/\\\$/g, "$") });
    }
    const display = match[1] !== undefined || match[2] !== undefined;
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    segments.push({ type: "math", value: value.trim(), ...(display ? { display: true } : {}) });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last).replace(/\\\$/g, "$") });
  }
  return segments.length ? segments : [{ type: "text", value: text.replace(/\\\$/g, "$") }];
}

function renderExponents(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  EXPONENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPONENT_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const inner = m[1].startsWith("(") ? m[1].slice(1, -1) : m[1];
    out.push(<sup key={`sup-${key++}`}>{inner}</sup>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderPlain(text: string, key: string): ReactNode {
  const normalized = normalizeLegacyMathText(text);
  if (!normalized.includes("^")) return <Fragment key={key}>{normalized}</Fragment>;
  return <Fragment key={key}>{renderExponents(normalized)}</Fragment>;
}

export function normalizeLegacyMathText(text: string): string {
  return text.replace(/(?<![A-Za-z])sqrt\s*\(/gi, "√(");
}

function renderMath(text: string, keyPrefix: string): ReactNode[] {
  const segments = parseMathSegments(text);
  return segments.map((segment, index) => {
    if (segment.type === "math") {
      return (
        <span
          key={`${keyPrefix}-math-${index}`}
          className={segment.display ? "my-3 block max-w-full overflow-x-auto py-1 text-center" : undefined}
          // KaTeX output is safe, sanitized HTML. throwOnError:false degrades
          // a malformed expression to its raw source instead of crashing.
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(segment.value, {
              throwOnError: false,
              displayMode: segment.display === true,
            }),
          }}
        />
      );
    }
    return renderPlain(segment.value, `${keyPrefix}-plain-${index}`);
  });
}

export function MathText({ children }: { children: string }) {
  return (
    <Fragment>
      {parseUnderlineMarkup(children).map((segment, index) =>
        segment.underlined ? (
          <u key={`underline-${index}`} className="decoration-[1.5px] underline-offset-2">
            {renderMath(segment.text, `underline-${index}`)}
          </u>
        ) : (
          <Fragment key={`text-${index}`}>{renderMath(segment.text, `text-${index}`)}</Fragment>
        ),
      )}
    </Fragment>
  );
}
