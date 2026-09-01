// Scoring + adaptive routing for the Bluebook-style digital SAT emulator.
//
// IMPORTANT — this is a transparent APPROXIMATION, not an official curve.
// College Board does NOT publish a raw->scaled conversion table for the live
// adaptive digital SAT. The only official tables are for the separate LINEAR
// PAPER practice tests (66 R&W / 54 Math questions, with lower/upper bands) on a
// different scale that cannot be mapped 1:1 onto the live 54-R&W / 44-Math
// adaptive test. Live scoring is form-specific Item Response Theory (3PL)
// equating that difficulty-weights each item and factors in which Module 2 the
// student was routed to, so two students with the same number correct can earn
// different scaled scores. Every constant below (routing thresholds, lower-path
// caps, and the four raw->scaled anchor curves) is therefore a reputable
// approximation synthesized from public College Board statements + test-prep
// estimates, and is intentionally tunable: when Scott's real per-form tables
// arrive, replace the constants and the rest of the model is unchanged.
//
// Faithful behaviors preserved: per-section 200-800 summing to 400-1600; Module 1
// performance routes each section INDEPENDENTLY into an easier or harder Module 2;
// the easier path CAPS the section score (R&W ~600, Math ~650) so only the harder
// path reaches 800. Curves are monotonic; the raw signal fed to them is
// difficulty-weighted (see DIFFICULTY_WEIGHT) to approximate IRT directionally.
//
// Sources (accessed 2026-06):
//  - CB, "How the SAT Is Structured" — 2 sections x 2 modules; R&W 54 Q, Math 44 Q;
//    each section 200-800; total 400-1600.
//    https://satsuite.collegeboard.org/sat/whats-on-the-test/structure
//  - CB, "How Are Scores Calculated?" — IRT, difficulty-weighted; same raw count
//    can map to different scaled scores.
//    https://satsuite.collegeboard.org/scores/what-scores-mean/how-scores-calculated
//  - CB blog, "What is Digital SAT Adaptive Testing?" — a couple wrong in Module 1
//    makes 800 impossible even with a perfect Module 2; routing is per-section.
//    https://blog.collegeboard.org/what-digital-sat-adaptive-testing
//  - Easy-path section caps (~590-650) + ~2/3 Module-1 routing threshold:
//    Piqosity https://www.piqosity.com/digital-sat-format-modules-easy-vs-hard/
//    IvyStrides https://www.ivystrides.com/blog/digital-sat-module-1-score-ceiling/
//    The SAT Crash Course https://thesatcrashcourse.com/what-to-do-if-you-get-the-easy-version-of-sat-module-2/
//  - Raw->scaled anchor triangulation (blended digital 0-54 / 0-44 curves):
//    satcalculator.org https://satcalculator.org/sat-score-chart/
//    Test Ninjas https://test-ninjas.com/digital-sat-score-calculator
//  - No public digital conversion table (only paper-form tables exist):
//    PrepScholar https://blog.prepscholar.com/how-to-calculate-sat-score
//    CB Practice Test 5 (paper) https://satsuite.collegeboard.org/media/pdf/scoring-sat-practice-test-5-digital.pdf

import type {
  AnswerMap,
  AnswerValue,
  Difficulty,
  ModuleVariant,
  PracticeTest,
  Question,
  Section,
  SectionId,
  TestModule,
  Domain,
} from "./types";

export function normalizeGridAnswer(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/^\+/, "");
}

export function isCorrect(q: Question, answer: AnswerValue | undefined): boolean {
  if (answer == null || answer === "") return false;
  if (q.type === "mc") return answer === q.correct;
  const given = normalizeGridAnswer(String(answer));
  return q.acceptedAnswers.some((a) => normalizeGridAnswer(a) === given);
}

export function moduleCorrect(mod: TestModule, answers: AnswerMap): number {
  return mod.questions.reduce(
    (n, q) => n + (isCorrect(q, answers[q.id]) ? 1 : 0),
    0,
  );
}

/* ----------------------------- Tunable constants ---------------------------- */

// Fraction correct on Module 1 that routes a section into the HARDER Module 2.
// Per-form values come from the DB (test.routeThreshold, i.e. the rw_threshold /
// math_threshold columns) so a real form's threshold drops in directly. These are
// the researched DEFAULTS used when a form does not carry a valid value: roughly
// two-thirds correct, R&W a touch higher than Math (sources in the header).
export const DEFAULT_ROUTE_THRESHOLD: Record<SectionId, number> = {
  rw: 0.67,
  math: 0.64,
};

// Maximum scaled section score reachable on the EASIER Module 2 path. The anchor
// curves already top out here; this is kept as a named, source-cited constant so
// the cap is explicit, enforced, and tunable. R&W high-500s/low-600s, Math ~650.
export const LOWER_PATH_CAP: Record<SectionId, number> = {
  rw: 600,
  math: 650,
};

// Per-question difficulty weights that approximate IRT difficulty-weighting: a
// WEIGHTED fraction-correct (not a flat count) feeds the raw->scaled curve, so
// landing harder items nudges the score up and clearing only easy items nudges it
// down. If a question has no/unknown difficulty the weight falls back to 1.0, so
// an unlabeled set degrades gracefully to a flat fraction. Tunable.
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 1.0,
  hard: 1.3,
  // Practice-test questions are never tagged challenge -- TestQuestionEditor
  // offers three tiers -- so this weight is unreachable from a scored test. It
  // sits above hard so the map stays total and stays sensible if that changes.
  challenge: 1.5,
};

/** Route into the easier or harder module 2 based on module-1 performance. */
export function routeVariant(
  test: PracticeTest,
  section: Section,
  answers: AnswerMap,
): ModuleVariant {
  const total = section.module1.questions.length;
  if (total === 0) return "easy";
  const frac = moduleCorrect(section.module1, answers) / total;
  const perForm = test.routeThreshold[section.id];
  const threshold =
    Number.isFinite(perForm) && perForm > 0 && perForm <= 1
      ? perForm
      : DEFAULT_ROUTE_THRESHOLD[section.id];
  return frac >= threshold ? "hard" : "easy";
}

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Raw->scaled conversion: four curves, one per section per Module 2 path. Anchor
// points are [weightedFractionCorrect (0..1), scaledScore], ascending. Lower-path
// curves top out at LOWER_PATH_CAP; upper-path curves reach 800 at a perfect
// section. Triangulated from the public calculators / CB paper bands in the header
// and meant to be replaced by Scott's official per-form tables. `frac` is the
// difficulty-weighted fraction correct across BOTH modules of the section.
type ScaleAnchor = { frac: number; score: number };

const SCALE_CURVES: Record<SectionId, Record<ModuleVariant, ScaleAnchor[]>> = {
  rw: {
    easy: [
      { frac: 0, score: 200 },
      { frac: 0.1, score: 250 },
      { frac: 0.2, score: 300 },
      { frac: 0.3, score: 350 },
      { frac: 0.4, score: 400 },
      { frac: 0.5, score: 445 },
      { frac: 0.6, score: 490 },
      { frac: 0.7, score: 525 },
      { frac: 0.8, score: 555 },
      { frac: 0.9, score: 580 },
      { frac: 1, score: 600 },
    ],
    hard: [
      { frac: 0, score: 200 },
      { frac: 0.1, score: 255 },
      { frac: 0.2, score: 315 },
      { frac: 0.3, score: 375 },
      { frac: 0.4, score: 435 },
      { frac: 0.5, score: 495 },
      { frac: 0.6, score: 555 },
      { frac: 0.7, score: 615 },
      { frac: 0.8, score: 675 },
      { frac: 0.9, score: 740 },
      { frac: 1, score: 800 },
    ],
  },
  math: {
    easy: [
      { frac: 0, score: 200 },
      { frac: 0.1, score: 250 },
      { frac: 0.2, score: 305 },
      { frac: 0.3, score: 360 },
      { frac: 0.4, score: 415 },
      { frac: 0.5, score: 470 },
      { frac: 0.6, score: 525 },
      { frac: 0.7, score: 575 },
      { frac: 0.8, score: 615 },
      { frac: 0.9, score: 640 },
      { frac: 1, score: 650 },
    ],
    hard: [
      { frac: 0, score: 200 },
      { frac: 0.1, score: 255 },
      { frac: 0.2, score: 315 },
      { frac: 0.3, score: 375 },
      { frac: 0.4, score: 435 },
      { frac: 0.5, score: 495 },
      { frac: 0.6, score: 560 },
      { frac: 0.7, score: 625 },
      { frac: 0.8, score: 690 },
      { frac: 0.9, score: 750 },
      { frac: 1, score: 800 },
    ],
  },
};

// Linear interpolation between the two anchors surrounding `frac`.
function interpScore(curve: ScaleAnchor[], frac: number): number {
  const f = clamp(frac, 0, 1);
  for (let i = 1; i < curve.length; i++) {
    const lo = curve[i - 1];
    const hi = curve[i];
    if (f <= hi.frac) {
      return lo.score + ((f - lo.frac) / (hi.frac - lo.frac)) * (hi.score - lo.score);
    }
  }
  return curve[curve.length - 1].score;
}

// Difficulty-weighted fraction correct over a set of questions. Approximates the
// IRT idea that harder items count for more; collapses to a flat fraction when no
// difficulty labels are present (all weights 1.0).
export function weightedFraction(questions: Question[], answers: AnswerMap): number {
  let totalWeight = 0;
  let correctWeight = 0;
  for (const q of questions) {
    const w = DIFFICULTY_WEIGHT[q.difficulty] ?? 1;
    totalWeight += w;
    if (isCorrect(q, answers[q.id])) correctWeight += w;
  }
  return totalWeight > 0 ? correctWeight / totalWeight : 0;
}

export type SectionScore = {
  sectionId: SectionId;
  variant: ModuleVariant;
  raw: number; // flat number correct, for honest display
  total: number;
  scaled: number;
};

export function scoreSection(
  section: Section,
  variant: ModuleVariant,
  answers: AnswerMap,
): SectionScore {
  const mod2 = section.module2[variant];
  const questions = [...section.module1.questions, ...mod2.questions];
  // `raw` is the plain count students see; the curve is driven by the weighted
  // fraction so difficulty matters (per the documented choice above).
  const raw = moduleCorrect(section.module1, answers) + moduleCorrect(mod2, answers);
  const total = questions.length;
  const frac = weightedFraction(questions, answers);
  const ceiling = variant === "easy" ? LOWER_PATH_CAP[section.id] : 800;
  let scaled = clamp(roundTo10(interpScore(SCALE_CURVES[section.id][variant], frac)), 200, ceiling);
  // Reserve 800 for a genuinely perfect section. College Board: a couple wrong on
  // Module 1 makes 800 impossible, and rounding could otherwise tip a near-perfect
  // hard-path section to 800. (Latent at real form sizes; enforced regardless.)
  if (variant !== "easy" && raw < total && scaled >= 800) scaled = 790;
  return { sectionId: section.id, variant, raw, total, scaled };
}

export type DomainResult = { domain: Domain; correct: number; total: number };

export function domainBreakdown(
  section: Section,
  variant: ModuleVariant,
  answers: AnswerMap,
): DomainResult[] {
  const counts = new Map<Domain, { correct: number; total: number }>();
  const questions = [
    ...section.module1.questions,
    ...section.module2[variant].questions,
  ];
  for (const q of questions) {
    const entry = counts.get(q.domain) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (isCorrect(q, answers[q.id])) entry.correct += 1;
    counts.set(q.domain, entry);
  }
  return [...counts.entries()].map(([domain, v]) => ({ domain, ...v }));
}

export type TestResult = {
  sections: SectionScore[];
  total: number;
  domains: DomainResult[];
};

export function scoreTest(
  test: PracticeTest,
  routed: Partial<Record<SectionId, ModuleVariant>>,
  answers: AnswerMap,
): TestResult {
  const sections = test.sections.map((s) =>
    scoreSection(s, routed[s.id] ?? "easy", answers),
  );
  const domains = test.sections.flatMap((s) =>
    domainBreakdown(s, routed[s.id] ?? "easy", answers),
  );
  const total = sections.reduce((sum, s) => sum + s.scaled, 0);
  return { sections, total, domains };
}
