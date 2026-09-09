import {
  parseUnderlineMarkup,
  unescapeDollarSigns,
} from "@/lib/sat/formattedText";
import type { ChoiceId } from "@/lib/sat/types";
import {
  CHOICES,
  type Flag,
  type ReadingQuestion,
  type ReadingStep,
  type ReadingTopic,
} from "./types";

export const TOPICS: Record<
  ReadingTopic,
  { title: string; question: string; reading: string; prediction: string }
> = {
  structure: {
    title: "Overall structure",
    question:
      "Identify what the question asks about the organization of the whole passage.",
    reading:
      "Track what each part does: introduces an idea, gives an example, makes a contrast, or reaches a conclusion.",
    prediction: "Describe how the passage develops from beginning to end.",
  },
  function: {
    title: "Function of underlined text",
    question:
      "Locate the underlined words and identify the part whose purpose you need to explain.",
    reading:
      "Consider what would change if the underlined portion were removed. Connect it to the sentences around it.",
    prediction: "Why did the author include the underlined portion?",
  },
  "cross-text": {
    title: "Cross-text connections",
    question:
      "Check whether you need agreement, a difference, or one author's response to the other.",
    reading:
      "Understand each text on its own, then compare the two positions. Do not assume they disagree.",
    prediction:
      "State the relationship between the texts that answers this question.",
  },
  "main-idea": {
    title: "Main idea",
    question: "Look for the central point of the whole passage.",
    reading:
      "Separate the central point from examples and supporting details. Check how the opening and ending connect.",
    prediction:
      "Summarize the main point of the entire passage in one sentence.",
  },
  details: {
    title: "Details",
    question:
      "Identify the specific information the question asks you to locate.",
    reading:
      "Track who does what and how the details relate. Keep what the passage states separate from assumptions.",
    prediction: "State the detail that answers the question.",
  },
  evidence: {
    title: "Command of evidence",
    question:
      "Check whether the question asks you to support, weaken, or illustrate a claim.",
    reading:
      "Identify the claim and the evidence it depends on. Consider what finding would affect that relationship.",
    prediction:
      "What evidence would support or challenge the claim in the way the question asks?",
  },
  graphs: {
    title: "Tables and graphs",
    question: "Identify which comparison or claim the data must address.",
    reading:
      "Predict which values or trend you will need from the figure. Keep the claim in mind as you read.",
    prediction:
      "Use the passage and the figure to predict the answer, including the relevant values or trend.",
  },
  inference: {
    title: "Inferences",
    question:
      "Identify what the conclusion must follow from. Notice words such as supports or undermines.",
    reading:
      "Connect each new fact to the earlier ones. Simplify dense relationships without adding unstated assumptions.",
    prediction:
      "What conclusion follows from the passage? Write it before considering the choices.",
  },
};

export const STEP_LABELS: Record<ReadingStep, string> = {
  preview: "Preview the question",
  round: "Choose your round",
  question: "Read the question",
  topic: "Find the topic",
  passage: "Read the passage",
  figure: "Review the figure",
  prediction: "Predict your answer",
  flags: "Scan for flags",
  order: "Order the choices",
  crossout: "Enable cross-out mode",
  choice: "Check each word",
  confidence: "Check your reasoning",
  select: "Select your answer",
  done: "Answer saved",
};

export function readingTopic(
  prompt: string,
  skill: string,
  figureUrl: string | null,
): ReadingTopic | null {
  const text = `${skill} ${prompt}`.toLowerCase();
  if (
    /words in context|transitions|boundaries|rhetorical synthesis|form, structure/.test(
      skill.toLowerCase(),
    )
  )
    return null;
  if (/table|graph|figure|data from/.test(text) || figureUrl) return "graphs";
  if (/underlined/.test(text) && /function|purpose/.test(text))
    return "function";
  if (/cross.text|text 1|text 2|both texts/.test(text)) return "cross-text";
  if (/overall structure|structure of the text/.test(text)) return "structure";
  if (/main idea|central idea|main purpose/.test(text)) return "main-idea";
  if (
    /weaken|support|illustrate|evidence|undermine/.test(text) &&
    !/logically completes/.test(prompt.toLowerCase())
  )
    return "evidence";
  if (/inference|logically completes|most likely/.test(text))
    return "inference";
  if (/details|according to|happens in the text/.test(text)) return "details";
  if (/structure|purpose/.test(text)) return "structure";
  return null;
}

export function passageWords(
  source: string,
): { text: string; start: number; end: number; underlined: boolean }[] {
  const segments = parseUnderlineMarkup(unescapeDollarSigns(source));
  let offset = 0;
  const ranges = segments.map((segment) => {
    const start = offset;
    offset += segment.text.length;
    return { start, end: offset, underlined: segment.underlined };
  });
  return [
    ...segments
      .map((segment) => segment.text)
      .join("")
      .matchAll(/\S+\s*/g),
  ].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
    underlined: ranges.some(
      (range) =>
        range.underlined &&
        range.start <= match.index &&
        range.end > match.index,
    ),
  }));
}
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
export function segmentCount(question: ReadingQuestion): number {
  return Math.max(1, Math.ceil(passageWords(question.passage).length / 5));
}

export function flagVocabulary(topic: ReadingTopic): {
  red: string[];
  green: string[];
  name: string;
} {
  return topic === "structure" || topic === "function"
    ? {
        name: "CEASED",
        red: [
          "explain",
          "explains",
          "argue",
          "argues",
          "compare",
          "compares",
          "emphasize",
          "emphasizes",
          "summarize",
          "summarizes",
          "describe",
          "describes",
        ],
        green: ["present", "presents"],
      }
    : {
        name: "BAD MOLD",
        red: [
          "likely",
          "most",
          "both",
          "other",
          "after",
          "despite",
          "different",
        ],
        green: ["some", "may"],
      };
}

export function choiceFlags(
  question: ReadingQuestion,
): Record<ChoiceId, { flag: Flag; words: string[]; repeated: string[] }> {
  const vocabulary = flagVocabulary(question.topic);
  const tokens = question.choices.map((choice) => ({
    id: choice.id,
    words: new Set(choice.text.toLowerCase().match(/[a-z]+/g) ?? []),
  }));
  const repeated = [...vocabulary.red, ...vocabulary.green].filter(
    (word) => tokens.filter((choice) => choice.words.has(word)).length > 1,
  );
  return Object.fromEntries(
    tokens.map(({ id, words }) => {
      const red = vocabulary.red.filter(
        (word) => words.has(word) && !repeated.includes(word),
      );
      const green = vocabulary.green.filter(
        (word) => words.has(word) && !repeated.includes(word),
      );
      return [
        id,
        {
          flag: red.length ? "red" : green.length ? "green" : "neutral",
          words: [...red, ...green],
          repeated: repeated.filter((word) => words.has(word)),
        },
      ];
    }),
  ) as Record<ChoiceId, { flag: Flag; words: string[]; repeated: string[] }>;
}

export function suggestedOrder(
  question: ReadingQuestion,
  scan: boolean,
): ChoiceId[] {
  const flags = choiceFlags(question);
  const available = question.choices.filter(
    (choice) => !scan || flags[choice.id].flag !== "red",
  );
  return (available.length ? available : question.choices)
    .slice()
    .sort(
      (a, b) =>
        wordCount(a.text) - wordCount(b.text) ||
        CHOICES.indexOf(a.id) - CHOICES.indexOf(b.id),
    )
    .map((choice) => choice.id);
}

export function formatReadingTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
