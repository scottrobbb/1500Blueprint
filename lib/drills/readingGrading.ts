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

// The third core point is whichever the passage actually supports: a passage
// built on a change over time has a Timeline; one built on an anomaly has a
// Resolution. These are the positional fallbacks when the model omits a label.
export const READING_CORE_LABELS = ["Topic", "Main finding", "Resolution"] as const;
export const READING_DEPTH_LABELS = ["Mechanism", "Consequences", "Significance"] as const;

// What each rung of the ladder asks for. Difficulty scales with how much a
// reader has to hold at once — competing claims, exceptions, technical terms,
// figures — and NOT with sentence length. The passages stay short because the
// timer is what tightens as the levels climb; a longer passage at level 6 would
// be testing reading speed, not recall.
const DIFFICULTY_BRIEF: Record<ReadingDifficulty, string> = {
  medium: [
    "100-130 words.",
    "One clear finding and why it matters.",
    "At most one technical term, glossed in parentheses.",
    "Two or three specific figures.",
  ].join(" "),
  hard: [
    "115-145 words.",
    "An established view or expectation, then a finding that complicates it.",
    "Two technical terms, each glossed in parentheses.",
    "Three or four specific figures.",
  ].join(" "),
  extreme: [
    "135-175 words.",
    "Build it on one of these shapes: (a) a general rule, then a specific exception, then what the exception shows; (b) an observation that looks paradoxical, then the mechanism that resolves it; (c) two named research teams with competing explanations, then the distinction between them.",
    "Three to five technical terms, each glossed in parentheses.",
    "Five or more specific figures — years, percentages, measurement ranges, sample sizes, species or genus names.",
    "The load comes from how much there is to hold at once. Do not reach for longer sentences.",
  ].join(" "),
};

// Two passages at the hardest tier, to fix the register and shape. They are
// shown for their build, never their subject.
const STYLE_EXEMPLARS = [
  "Hartwell's 2019 neuroimaging studies revealed that children with autism spectrum disorder exhibit hyperactive mirror neuron systems (brain circuits that fire both when performing an action and observing others perform the same action) during social observation tasks, contradicting the widely accepted mirror neuron deficit hypothesis that had dominated explanations for social cognition impairments in these populations. This hyperactivation proves puzzling because enhanced mirror neuron function should theoretically improve, rather than impair, the ability to understand others' intentions and emotional states through automatic neural mimicry. The most compelling explanation suggests that excessive mirror neuron firing creates a paradoxical interference effect, where overwhelming neural resonance with observed actions actually disrupts the complex integration processes required for higher-order social understanding.",
  "Most bioluminescent fungi employ their light emission as a broad-spectrum attractant that draws diverse arthropod species indiscriminately, thereby maximizing spore dispersal opportunities through what mycologists term the \"generalist hypothesis\" (which posits that evolutionary success derives from casting the widest possible net for potential vectors). Panellus pusillus, however, exhibits highly selective photonic behavior that attracts exclusively nocturnal beetles of the genus Tritoma while simultaneously repelling other insects through wavelength modulation between 480-520 nanometers — a phenomenon that occurs only when ambient humidity exceeds 85 percent and soil nitrogen levels drop below critical thresholds. This specificity emerges because the fungus has co-evolved with Tritoma species whose specialized photoreceptors are uniquely calibrated to detect these precise spectral conditions, creating an exclusive mutualistic partnership. The Panellus exception demonstrates that the generalist model fails when environmental constraints favor precision over breadth in vector recruitment strategies.",
];

export function readingPassageSystemPrompt(): string {
  return [
    "You write short nonfiction reading passages for a memory-recall drill on the digital SAT, then list the ideas a strong recall must contain.",
    "The passage must be original, factually plausible, self-contained, and free of any question, heading, title, or byline. Write it as one paragraph of flowing prose.",
    "Vary the subject every time. Draw from biology, neuroscience, ecology, physics, archaeology, economics, history, linguistics, art history, and the social sciences.",
    "Write in clear academic prose. Every sentence carries one idea and stays under about 40 words, and no passage opens with a long multi-clause sentence.",
    "Difficulty comes from how much a reader has to hold at once — competing claims, exceptions, technical terms, figures — never from tangled syntax, stacked subordinate clauses, or nominalized abstraction. A dense passage a reader cannot parse is a failed passage.",
    "The passage must report a definite finding, change, or anomaly, and must end by resolving it: what the finding shows, why the anomaly happens, or what distinguishes the competing accounts.",
    "Gloss each technical term in parentheses the first time it appears.",
    "Include at least one name of a person, team, or institution that is NOT needed to state what the passage is about. This is the decoy layer. Species names, measurements, and terms that carry the finding are content, not decoys.",
    "Stay inside the word budget you are given. A passage over budget is worse than one under it.",
    "Return strict JSON only, with no prose outside the object.",
  ].join(" ");
}

export function buildReadingPassageUser(difficulty: ReadingDifficulty, avoidTopics: string[]): string {
  const avoid = avoidTopics.length
    ? `Do not write about any of these recent subjects: ${avoidTopics.join("; ")}.`
    : "";

  return [
    `Difficulty: ${difficulty}. ${DIFFICULTY_BRIEF[difficulty]}`,
    avoid,
    [
      "Two passages at the hardest tier, for register and shape only — never borrow their subjects.",
      difficulty === "extreme"
        ? "Match them."
        : "They sit above what you are writing: match their clarity and their build, but carry less at once and stay inside your word budget.",
      `\n\n${STYLE_EXEMPLARS.map((x) => `---\n${x}`).join("\n\n")}\n---`,
    ].join(" "),
    "Write one paragraph, then list exactly 3 core points and exactly 3 depth points.",
    'Core points are the main idea and its resolution. Label the first two "Topic" and "Main finding". Label the third "Timeline" when the passage turns on a specific time frame, or "Resolution" when it turns on what the finding shows or explains — pick whichever the passage actually supports.',
    `Depth points use exactly these labels, in this order: ${READING_DEPTH_LABELS.join(", ")}. Depth points are the supporting layer: how it works, what follows from it, and why it matters.`,
    "Every point must be a single clause of at most 20 words, stated so a grader can check whether a student's summary contains that idea. Never make a point that is only a person's name, an institution's name, or a decorative detail.",
    'Return strict JSON only: {"topic":"<3-6 word subject label>","body":["<the paragraph>"],"corePoints":[{"label":"Topic","text":"..."},{"label":"Main finding","text":"..."},{"label":"Timeline|Resolution","text":"..."}],"depthPoints":[{"label":"Mechanism","text":"..."},{"label":"Consequences","text":"..."},{"label":"Significance","text":"..."}]}',
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
