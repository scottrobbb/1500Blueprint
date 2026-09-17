import katex from "katex";
import { Fragment, type ReactNode } from "react";
import { normalizeBulletMarkup, parseUnderlineMarkup, unescapeDollarSigns } from "@/lib/sat/formattedText";
import { splitTableBlocks, TABLE_ROWSEP } from "@/lib/sat/table-markup";

// Renders authored LaTeX and legacy plain-text SAT equations with KaTeX. The
// legacy importer preserved many equations as `C = r·n` or `(x + 1)/2`; those
// spans are detected conservatively and normalized at render time so thousands
// of existing questions do not need destructive content rewrites.

const EXPONENT_RE = /\^(\([^)]*\)|[+−-]?[A-Za-z0-9]+)/g;
// Accept the delimiters used across both imported question banks and the
// hand-authored CMS. Display math must be matched before inline dollars so a
// `$$...$$` block is not misread as stray literal dollar signs.
//
// Inline `$...$` deliberately stops at a newline: prose carrying unescaped
// dollar amounts would otherwise let one `$` swallow everything up to the next
// one paragraphs away. A complete LaTeX environment is exempt -- `\begin{...}`
// through `\end{...}` is unambiguously math, and a table written that way
// spans lines in the source -- so it is matched first, across newlines.
const MATH_RE = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(\s*\\begin\{[\s\S]*?\\end\{[A-Za-z*]+\}\s*)(?<!\\)\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
const LEGACY_ROOT = String.raw`(?:[A-Za-z0-9]+)?(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+√|√|∛|∜)\([^()\n]+\)`;
const LEGACY_ATOM = String.raw`(?:${LEGACY_ROOT}|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\([^()\n]+\)|[A-Za-z0-9]+(?:\.[0-9]+)?[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*(?:\^\(?[A-Za-z0-9+\-\/]+\)?)?(?:\([^()\n]+\))?)`;
const LEGACY_OPERATOR = String.raw`(?:\s*[+\-−×·*/÷]\s*)`;
const LEGACY_SIDE = `${LEGACY_ATOM}(?:${LEGACY_OPERATOR}${LEGACY_ATOM})*`;
const LEGACY_ARITHMETIC = `${LEGACY_ATOM}(?:${LEGACY_OPERATOR}${LEGACY_ATOM})+`;
const LEGACY_MATH_RE = new RegExp(
  `(${LEGACY_SIDE}\\s*(?:=|≤|≥|≠|<|>)\\s*${LEGACY_SIDE}|${LEGACY_ARITHMETIC})`,
  "g",
);
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};
const VULGAR_FRACTIONS: Record<string, string> = {
  "½": "\\frac{1}{2}", "⅓": "\\frac{1}{3}", "⅔": "\\frac{2}{3}",
  "¼": "\\frac{1}{4}", "¾": "\\frac{3}{4}", "⅕": "\\frac{1}{5}",
  "⅖": "\\frac{2}{5}", "⅗": "\\frac{3}{5}", "⅘": "\\frac{4}{5}",
  "⅙": "\\frac{1}{6}", "⅚": "\\frac{5}{6}", "⅛": "\\frac{1}{8}",
  "⅜": "\\frac{3}{8}", "⅝": "\\frac{5}{8}", "⅞": "\\frac{7}{8}",
};

export type MathSegment = { type: "text" | "math"; value: string; display?: boolean };

export function parseMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: unescapeDollarSigns(text.slice(last, index)) });
    }
    const display = match[1] !== undefined || match[2] !== undefined;
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    segments.push({ type: "math", value: value.trim(), ...(display ? { display: true } : {}) });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: unescapeDollarSigns(text.slice(last)) });
  }
  return segments.length ? segments : [{ type: "text", value: unescapeDollarSigns(text) }];
}

export function parseLegacyMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  LEGACY_MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LEGACY_MATH_RE.exec(text))) {
    const value = match[0];
    if (!isLikelyMath(value)) continue;
    if (match.index > last) segments.push({ type: "text", value: text.slice(last, match.index) });
    segments.push({ type: "math", value: plainMathToLatex(value) });
    last = match.index + value.length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  if (segments.some((segment) => segment.type === "math")) return segments;

  const trimmed = text.trim();
  if (trimmed && isStandaloneMath(trimmed)) {
    const start = text.indexOf(trimmed);
    return [
      ...(start > 0 ? [{ type: "text" as const, value: text.slice(0, start) }] : []),
      { type: "math", value: plainMathToLatex(trimmed) },
      ...(start + trimmed.length < text.length ? [{ type: "text" as const, value: text.slice(start + trimmed.length) }] : []),
    ];
  }
  return [{ type: "text", value: text }];
}

export function plainMathToLatex(value: string): string {
  const fractionAtom = String.raw`(?:\([^()]+\)|[A-Za-z0-9]+(?:\.[0-9]+)?[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*(?:\^\(?[A-Za-z0-9+\-\/]+\)?)?)`;
  const fractionPattern = new RegExp(`(${fractionAtom})\\s*\\/\\s*(${fractionAtom})`, "g");
  let latex = value.replace(fractionPattern, (_match, numerator: string, denominator: string) => (
    `\\frac{${stripOuterParens(numerator)}}{${stripOuterParens(denominator)}}`
  ));
  latex = latex
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (fraction) => VULGAR_FRACTIONS[fraction] ?? fraction)
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)√\(([^()]+)\)/g, (_match, index: string, body: string) => `\\sqrt[${superscriptValue(index)}]{${body}}`)
    .replace(/∛\(([^()]+)\)/g, "\\sqrt[3]{$1}")
    .replace(/∜\(([^()]+)\)/g, "\\sqrt[4]{$1}")
    .replace(/√\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/√([A-Za-z0-9]+)/g, "\\sqrt{$1}")
    .replace(/([A-Za-z0-9})\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_match, base: string, exponent: string) => `${base}^{${superscriptValue(exponent)}}`)
    .replace(/−/g, "-")
    .replace(/×/g, "\\times ")
    .replace(/·/g, "\\cdot ")
    .replace(/÷/g, "\\div ")
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/≠/g, "\\ne ")
    .replace(/π/g, "\\pi ");
  return latex.trim();
}

// One piece of what MathText draws for a run of text: characters shown as
// themselves, or something it typesets. The highlighter lays question text out
// from these same pieces, so the two cannot drift apart.
export type MathToken =
  | { type: "text"; value: string }
  | { type: "katex"; value: string; display?: boolean }
  | { type: "sup"; value: string };

function exponentTokens(text: string): MathToken[] {
  const out: MathToken[] = [];
  let last = 0;
  EXPONENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPONENT_RE.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "sup", value: m[1].startsWith("(") ? m[1].slice(1, -1) : m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function plainTokens(text: string): MathToken[] {
  const normalized = normalizeLegacyMathText(text);
  const segments = parseLegacyMathSegments(normalized);
  if (!segments.some((segment) => segment.type === "math")) {
    return normalized.includes("^") ? exponentTokens(normalized) : [{ type: "text", value: normalized }];
  }
  return segments.flatMap((segment): MathToken[] =>
    segment.type === "math" ? [{ type: "katex", value: segment.value }] : exponentTokens(segment.value),
  );
}

export function normalizeLegacyMathText(text: string): string {
  return text.replace(/(?<![A-Za-z])sqrt\s*\(/gi, "√(");
}

// Tokens for one underline segment's text, which is what MathText renders
// piece by piece.
export function mathTokens(text: string): MathToken[] {
  return parseMathSegments(text).flatMap((segment): MathToken[] =>
    segment.type === "math"
      ? [{ type: "katex", value: segment.value, ...(segment.display ? { display: true } : {}) }]
      : plainTokens(segment.value),
  );
}

export function MathTokenView({ token }: { token: MathToken }) {
  if (token.type === "katex") return <KatexSpan value={token.value} display={token.display} />;
  if (token.type === "sup") return <sup>{token.value}</sup>;
  return <>{token.value}</>;
}

function renderMath(text: string, keyPrefix: string): ReactNode[] {
  return mathTokens(text).map((token, index) => <MathTokenView key={`${keyPrefix}-${index}`} token={token} />);
}

function KatexSpan({ value, display = false }: { value: string; display?: boolean }) {
  return (
    <span
      className={display ? "my-3 block max-w-full overflow-x-auto py-1 text-center" : "inline-block align-baseline"}
      // KaTeX emits both visual HTML and accessible MathML. Malformed legacy
      // expressions degrade to their source instead of crashing the question.
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(value, {
          throwOnError: false,
          displayMode: display,
          strict: "ignore",
        }),
      }}
    />
  );
}

function isLikelyMath(value: string): boolean {
  const words = value.match(/[A-Za-z]+/g) ?? [];
  const allowedWords = new Set(["sin", "cos", "tan", "log", "ln", "sqrt"]);
  return words.every((word) => word.length <= 2 || allowedWords.has(word.toLowerCase()));
}

function isStandaloneMath(value: string): boolean {
  return /^[+−-]?\d+(?:\.\d+)?$/.test(value)
    || /^[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]$/.test(value)
    || /^(?:π|[A-Za-z])(?:[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|\^\(?[A-Za-z0-9+\-\/]+\)?)$/.test(value);
}

function stripOuterParens(value: string): string {
  return value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value;
}

function superscriptValue(value: string): string {
  return [...value].map((character) => SUPERSCRIPT_DIGITS[character] ?? character).join("");
}

// Highlighting maps a DOM text offset back onto the source string, which only
// holds while the rendered output is that string. KaTeX emits accessible MathML
// beside its visual HTML, so math in the prose makes the offsets point at the
// wrong characters and falls back to ordinary rendering.
//
// Importer tables are fine: the highlighter lays them out itself, typesetting
// their contents and the prose around them the way MathText does and counting
// only the characters drawn as text (see highlight-layout). Row markers outside
// a table that parses mean broken markup, which the highlighter would print
// literally.
export function isHighlightableText(text: string): boolean {
  if (!text.trim()) return false;
  return splitTableBlocks(text).every((block) => block.kind === "table" || rendersAsSource(block.source));
}

// Whether prose reaches the screen as its own characters. Bullet markers are
// normalised to a character before rendering, so they are not math by the time
// either renderer sees them.
function rendersAsSource(text: string): boolean {
  if (text.includes(TABLE_ROWSEP)) return false;
  return parseMathSegments(normalizeBulletMarkup(text)).every((segment) => segment.type === "text");
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
