// Blocks a specific set of slurs + "rape" from post/comment bodies at write
// time (see app/api/community/posts/route.ts and .../comments/route.ts).
// This list is intentionally short and explicit, per direct instruction —
// not a general-purpose profanity filter. Digit leetspeak (0/1/3/4/5/7) and
// separator characters (spaces, dots, dashes) between letters are tolerated
// so spaced-out or numeral-substituted evasions still match; this is not
// resistant to Unicode homoglyph tricks.

const SLUR_ROOTS = [
  "nigger",
  "nigga",
  "beaner",
  "faggot",
  "fag",
  "tranny",
  "gook",
  "rape",
];

const LEET: Record<string, string> = {
  a: "a4",
  e: "e3",
  i: "i1",
  o: "o0",
  s: "s5",
  t: "t7",
};

function letterGroup(ch: string): string {
  const alts = LEET[ch];
  return alts ? `[${alts}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(root: string): RegExp {
  const sep = "[\\s._-]*";
  const body = root
    .split(" ")
    .map((word) => word.split("").map(letterGroup).map((g) => `${g}+`).join(sep))
    .join(sep);
  return new RegExp(`\\b${body}\\b`, "i");
}

const PATTERNS = SLUR_ROOTS.map(buildPattern);

export function containsSlur(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some((pattern) => pattern.test(text));
}
