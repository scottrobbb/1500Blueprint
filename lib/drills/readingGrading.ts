// The Reading Comprehension Drill's generation + recall-grading contract.
//
// A recall is scored against two tiers of points. CORE points are what the
// passage is actually about — its topic, the finding it reports, and the time
// frame it covers. DEPTH points are the supporting layer — mechanism,
// consequences, significance. Core carries the overwhelming majority of the
// score, so a student who nails the main idea but forgets a name still passes,
// while one who lists names and dates without the main idea does not.
//
// The model never picks the number. It only decides how well each point was
// recalled; the score is computed here so the weighting is exact and identical
// for every student.

import type { ReadingDifficulty } from "./readingLevels";

export const READING_CORE_WEIGHT = 0.8;
export const READING_DEPTH_WEIGHT = 0.2;
// Each unsupported claim costs this much, up to the cap. Recall is worthless if
// the student confidently invents what the passage said.
export const READING_FABRICATION_PENALTY = 5;
export const READING_FABRICATION_PENALTY_CAP = 20;

export type ReadingPointTier = "core" | "depth";

// One checkable idea. `label` is the short kind ("Topic", "Main finding",
// "Timeline", "Mechanism", ...) shown before the text in the feedback list.
export type ReadingPoint = {
  label: string;
  text: string;
};

export type ReadingRecall = "full" | "partial" | "missed";

export type GradedReadingPoint = ReadingPoint & {
  tier: ReadingPointTier;
  recall: ReadingRecall;
};

export const RECALL_CREDIT: Record<ReadingRecall, number> = {
  full: 1,
  partial: 0.5,
  missed: 0,
};

export const READING_CORE_LABELS = ["Topic", "Main finding", "Timeline"] as const;
export const READING_DEPTH_LABELS = ["Mechanism", "Consequences", "Significance"] as const;

// Word budgets and prose targets per level difficulty.
const DIFFICULTY_BRIEF: Record<ReadingDifficulty, string> = {
  medium:
    "180-220 words. Clear, accessible academic prose in the register of an SAT Reading passage: plain sentences, concrete nouns, at most one technical term (defined in context).",
  hard:
    "230-270 words. Denser academic prose: longer sentences with subordinate clauses, abstract vocabulary, two or three technical terms used without definition, and at least one qualifying or contrasting claim.",
  extreme:
    "280-330 words. Extremely dense scholarly prose at the hardest end of the SAT range: multi-clause sentences, nominalizations, several technical terms, at least two competing findings or interpretations, and several specific figures, dates, and named entities packed closely together.",
};

export function readingPassageSystemPrompt(): string {
  return [
    "You write short nonfiction reading passages for a memory-recall drill on the digital SAT, then list the ideas a strong recall must contain.",
    "The passage must be original, factually plausible, self-contained, and free of any question, heading, title, or byline. Write it as flowing prose only.",
    "Vary the subject every time. Draw from science, social science, history, economics, technology, art history, and archaeology. Never write about the same topic twice in a row.",
    "The passage must report a definite finding or change and must cover a definite time frame with specific years, so a reader can state a topic, a finding, and a timeline.",
    "It must also contain concrete surface detail — names of people, institutions, and places — that is NOT part of the main idea. This detail is the decoy layer and must never be needed to state what the passage is about.",
    "Return strict JSON only, with no prose outside the object.",
  ].join(" ");
}

export function buildReadingPassageUser(difficulty: ReadingDifficulty, avoidTopics: string[]): string {
  const avoid = avoidTopics.length
    ? `Do not write about any of these recent topics: ${avoidTopics.join("; ")}.`
    : "";

  return [
    `Difficulty: ${difficulty}. ${DIFFICULTY_BRIEF[difficulty]}`,
    avoid,
    "Split the passage into 1-3 paragraphs.",
    "Then list exactly 3 core points and exactly 3 depth points.",
    `Core points use exactly these labels, in this order: ${READING_CORE_LABELS.join(", ")}. Core points are the main idea and resolution of the passage: what it is about, what was found or changed, and when it happened.`,
    `Depth points use exactly these labels, in this order: ${READING_DEPTH_LABELS.join(", ")}. Depth points are the supporting layer: how it worked, what followed from it, and why it mattered.`,
    "Every point must be a single clause of at most 20 words, stated so a grader can check whether a student's summary contains that idea. Never make a point that is only a person's name, an institution's name, or a decorative detail.",
    'Return strict JSON only: {"topic":"<3-6 word subject label>","body":["<paragraph>", ...],"corePoints":[{"label":"Topic","text":"..."},{"label":"Main finding","text":"..."},{"label":"Timeline","text":"..."}],"depthPoints":[{"label":"Mechanism","text":"..."},{"label":"Consequences","text":"..."},{"label":"Significance","text":"..."}]}',
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const READING_GRADING_SYSTEM_PROMPT = [
  "You are grading a student's from-memory recall summary of an SAT reading passage they can no longer see.",
  "You are given the passage and two tiers of checkable points: CORE points (the main idea, the finding, and the time frame — what the passage is actually about) and DEPTH points (mechanism, consequences, significance — the supporting layer).",
  "For each point decide whether the summary recalls it fully, partially, or not at all. Judge meaning, never wording: a correct paraphrase is full recall, and a student never has to reproduce the passage's phrasing, names, or exact numbers to earn a point unless the point itself is about that number.",
  "Mark 'partial' when the summary gestures at the idea but leaves out the part that makes it specific — a claim without its direction, a change without its period, a finding without what it was about.",
  "Ignore surface detail the points do not ask for. Do not reward or punish a student for remembering names of people, institutions, or places, or any other detail that is not part of the main idea and resolution.",
  "Separately, list any claim the summary makes that the passage does not support. Only list clear contradictions or invented facts, never a vague or compressed restatement.",
  "Write one direct sentence of verdict addressed to the student.",
].join(" ");

export function buildReadingGradeUser(
  body: string[],
  corePoints: ReadingPoint[],
  depthPoints: ReadingPoint[],
  studentText: string,
): string {
  const list = (points: ReadingPoint[]) =>
    points.map((p, i) => `${i + 1}. [${p.label}] ${p.text}`).join("\n");

  return [
    `Passage:\n${body.join("\n\n")}`,
    `CORE points (the main idea and resolution):\n${list(corePoints)}`,
    `DEPTH points (the supporting layer):\n${list(depthPoints)}`,
    `Student's summary:\n${studentText}`,
    'Return strict JSON only: {"verdict":"<one sentence>","core":[{"label":"<label>","recall":"full|partial|missed"}, ...],"depth":[{"label":"<label>","recall":"full|partial|missed"}, ...],"fabrications":["<unsupported claim>", ...]}. Output one entry per provided point, in the given order, copying each label verbatim. Use [] when nothing was fabricated.',
  ].join("\n\n");
}

function tierRatio(points: GradedReadingPoint[]): number {
  if (points.length === 0) return 1;
  const earned = points.reduce((sum, p) => sum + RECALL_CREDIT[p.recall], 0);
  return earned / points.length;
}

// The published score: core recall weighted at 80%, depth at 20%, less a capped
// penalty for invented claims.
export function scoreReadingRecall(
  core: GradedReadingPoint[],
  depth: GradedReadingPoint[],
  fabrications: string[],
): number {
  const earned = READING_CORE_WEIGHT * tierRatio(core) + READING_DEPTH_WEIGHT * tierRatio(depth);
  const penalty = Math.min(
    READING_FABRICATION_PENALTY_CAP,
    fabrications.length * READING_FABRICATION_PENALTY,
  );
  return Math.max(0, Math.min(100, Math.round(earned * 100) - penalty));
}
