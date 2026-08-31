// Stacked systems-of-equations answer choices ("39x + 17y = 10" over
// "ax - 3by = 10") arrive from Word as two lines, but the importer used to
// join a multi-line choice's parts with a space (see parseChoices in
// scripts/import/parse.ts), flattening both equations onto one row. The break
// is not recoverable from the stored text, so this re-derives it -- but only
// for choices that are unambiguously nothing but equations separated by
// whitespace. Anything with prose between or around them is left alone.

const ATOM = String.raw`(?:\([^()\n]+\)|[A-Za-z0-9]+(?:\.[0-9]+)?[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*(?:\^\(?[A-Za-z0-9+\-\/]+\)?)?)`;
const OPERATOR = String.raw`(?:\s*[+\-−×·*/÷]\s*)`;
const SIDE = `${ATOM}(?:${OPERATOR}${ATOM})*`;
const RELATION = String.raw`\s*(?:=|≤|≥|≠|<|>)\s*`;
const EQUATION = new RegExp(`${SIDE}${RELATION}${SIDE}`, "g");

export function splitStackedEquations(text: string): string {
  // An authored break is already the source of truth -- never second-guess it.
  if (text.includes("\n")) return text;

  EQUATION.lastIndex = 0;
  const matches = [...text.matchAll(EQUATION)];
  if (matches.length < 2) return text;

  // Require the whole string to be equations joined by whitespace. A gap
  // holding "and", "or", a comma, or any other prose means this is a sentence
  // that happens to contain equations, not a stacked system.
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    if (text.slice(cursor, index).trim() !== "") return text;
    cursor = index + match[0].length;
  }
  if (text.slice(cursor).trim() !== "") return text;

  return matches.map((match) => match[0].trim()).join("\n");
}
