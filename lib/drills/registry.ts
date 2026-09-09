import type { DrillSlug } from "./types";

const TITLES: Record<DrillSlug | "dense-reading", string> = {
  "dense-reading": "Dense Reading",
  grammar: "Grammar Drill",
  "targeted-math": "Targeted Math Practice",
  reading: "Reading Comprehension",
  "word-scan": "Word Scan Drill",
  vocab: "Vocab Drill",
  flashcards: "Vocab Flashcards",
  "ai-math": "AI Math Practice",
};

// Maps a drill slug to its display title (used where only the slug is known).
export function drillTitle(slug: string): string {
  return TITLES[slug as DrillSlug] ?? "Drill";
}
