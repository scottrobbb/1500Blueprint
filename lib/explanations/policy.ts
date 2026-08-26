export const EXPLANATION_MIN_WORDS = 15;
export const EXPLANATION_MAX_CHARACTERS = 20_000;

export function countExplanationWords(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

export function staffExplanationIssue(value: string): string | null {
  if (value.length > EXPLANATION_MAX_CHARACTERS) {
    return `Keep the explanation under ${EXPLANATION_MAX_CHARACTERS.toLocaleString()} characters.`;
  }
  const words = countExplanationWords(value);
  if (words < EXPLANATION_MIN_WORDS) {
    return `Write at least ${EXPLANATION_MIN_WORDS} words so the explanation teaches the full reasoning.`;
  }
  return null;
}
