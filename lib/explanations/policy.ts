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

export const QUESTION_PROMPT_MAX_CHARACTERS = 20_000;
export const QUESTION_PASSAGE_MAX_CHARACTERS = 50_000;
export const QUESTION_CHOICE_MAX_CHARACTERS = 5_000;

// Mirrors the same bounds enforced in update_staff_question_content() so the
// client can fail fast instead of round-tripping to the server first.
export function staffQuestionPromptIssue(value: string): string | null {
  if (!value.trim()) return "The question prompt cannot be blank.";
  if (value.length > QUESTION_PROMPT_MAX_CHARACTERS) {
    return `Keep the prompt under ${QUESTION_PROMPT_MAX_CHARACTERS.toLocaleString()} characters.`;
  }
  return null;
}

export function staffQuestionPassageIssue(value: string): string | null {
  if (value.length > QUESTION_PASSAGE_MAX_CHARACTERS) {
    return `Keep the passage under ${QUESTION_PASSAGE_MAX_CHARACTERS.toLocaleString()} characters.`;
  }
  return null;
}

export function staffQuestionChoiceIssue(value: string): string | null {
  if (!value.trim()) return "Choice text cannot be blank.";
  if (value.length > QUESTION_CHOICE_MAX_CHARACTERS) {
    return `Keep each choice under ${QUESTION_CHOICE_MAX_CHARACTERS.toLocaleString()} characters.`;
  }
  return null;
}
