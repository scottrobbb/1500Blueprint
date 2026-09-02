export type FormattedTextSegment = {
  text: string;
  underlined: boolean;
};

// Practice-test content is stored as plain text. Support only the exact, safe
// <u>...</u> pair instead of rendering arbitrary HTML from the question bank.

// Rhetorical synthesis notes are authored as a bulleted list, but the bullet
// itself arrives as LaTeX -- `\(\bullet\)` and friends. Left alone it either
// prints literally (the highlight renderer does no math) or renders through
// KaTeX as a small centred math operator, neither of which reads as a bullet.
//
// Normalising it to a real character before anything else runs means both
// renderers show the same list, and -- because the marker was the only math on
// most of these passages -- it also lets them stay highlightable.
const BULLET_MARKER = /^[ \t]*(?:\\\(\s*\\bullet\s*\\\)|\\\[\s*\\bullet\s*\\\]|\$\$?\s*\\bullet\s*\$\$?|\\bullet)[ \t]*/gm;

// Authors write a literal dollar sign as "\$" so the math parser does not read
// it as a delimiter. Every surface that renders source text has to undo that,
// or the backslash reaches the screen -- MathText does it while splitting math
// segments, HighlightablePassage has to do it explicitly.
export function unescapeDollarSigns(text: string): string {
  return text.replace(/\\\$/g, "$");
}

export function normalizeBulletMarkup(value: string): string {
  return value.replace(BULLET_MARKER, "\u2022 ");
}

export function parseUnderlineMarkup(rawValue: string): FormattedTextSegment[] {
  const value = normalizeBulletMarkup(rawValue);
  const segments: FormattedTextSegment[] = [];
  const underlinePattern = /<u>([\s\S]*?)<\/u>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = underlinePattern.exec(value))) {
    if (match.index > lastIndex) {
      segments.push({ text: value.slice(lastIndex, match.index), underlined: false });
    }
    segments.push({ text: match[1], underlined: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ text: value.slice(lastIndex), underlined: false });
  }

  return segments.length > 0 ? segments : [{ text: value, underlined: false }];
}
