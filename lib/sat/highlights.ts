// Passage highlights, keyed by question id. The practice test runner and the
// question bank runner both hold a map of these and mutate it the same way, so
// the transitions live here rather than being written out twice.
export type Highlight = {
  id: string;
  start: number;
  end: number;
  color: string;
  note?: string;
};

export type HighlightsByQuestion = Record<string, Highlight[]>;

// A highlight's start/end are offsets into one specific string, so passage and
// prompt ranges cannot share a list -- the same numbers would point at two
// different texts. Prompts get their own key in the same map, which keeps the
// transitions above and the saved-session shape unchanged.
export function promptHighlightKey(questionId: string): string {
  return `${questionId}::prompt`;
}

export function addHighlight(
  all: HighlightsByQuestion,
  questionId: string,
  highlight: Highlight,
): HighlightsByQuestion {
  return { ...all, [questionId]: [...(all[questionId] ?? []), highlight] };
}

// Removes every highlight overlapping the range, which is what the toolbar's
// eraser and the note editor's Delete both mean by "remove this".
export function removeHighlight(
  all: HighlightsByQuestion,
  questionId: string,
  start: number,
  end: number,
): HighlightsByQuestion {
  return {
    ...all,
    [questionId]: (all[questionId] ?? []).filter((item) => !(item.start < end && item.end > start)),
  };
}

export function setHighlightNote(
  all: HighlightsByQuestion,
  questionId: string,
  id: string,
  note: string,
): HighlightsByQuestion {
  return {
    ...all,
    [questionId]: (all[questionId] ?? []).map((item) => (item.id === id ? { ...item, note } : item)),
  };
}
