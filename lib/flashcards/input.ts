import type { CardInput, SetInput, SetVisibility } from "./types";

export const MAX_FLASHCARD_SET_BYTES = 3 * 1024 * 1024;
export const MAX_FLASHCARDS_PER_SET = 500;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_CARD_TEXT_LENGTH = 2_000;
const MAX_IMAGE_URL_LENGTH = 2_048;

export function parseSetInput(value: unknown, canPublish: boolean): SetInput | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== "string" || value.title.length > MAX_TITLE_LENGTH) return null;
  if (
    value.description !== undefined
    && value.description !== null
    && (typeof value.description !== "string" || value.description.length > MAX_DESCRIPTION_LENGTH)
  ) return null;
  if (!Array.isArray(value.cards) || value.cards.length > MAX_FLASHCARDS_PER_SET) return null;

  const cards: CardInput[] = [];
  for (const candidate of value.cards) {
    if (!isRecord(candidate)) return null;
    if (
      typeof candidate.term !== "string"
      || candidate.term.length > MAX_CARD_TEXT_LENGTH
      || typeof candidate.definition !== "string"
      || candidate.definition.length > MAX_CARD_TEXT_LENGTH
    ) return null;
    const termImageUrl = imageUrl(candidate.termImageUrl);
    const definitionImageUrl = imageUrl(candidate.definitionImageUrl);
    if (termImageUrl === undefined || definitionImageUrl === undefined) return null;
    cards.push({
      term: candidate.term,
      definition: candidate.definition,
      termImageUrl,
      definitionImageUrl,
    });
  }

  const visibility: SetVisibility = value.visibility === "shared" && canPublish ? "shared" : "private";
  return {
    title: value.title,
    description: typeof value.description === "string" ? value.description : null,
    visibility,
    cards,
  };
}

function imageUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_IMAGE_URL_LENGTH) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
