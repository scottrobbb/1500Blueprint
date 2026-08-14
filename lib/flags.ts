// Practice Tests 3-5 remain student-locked while Tests 1, 2, 6, and 7 are public. Admins
// keep access to every test for QA. Pure + edge-safe for proxy and server routes.
export const LOCKED_PRACTICE_TEST_SLUGS = [
  "practice-test-3",
  "practice-test-4",
  "practice-test-5",
] as const;

export function isPracticeTestUnderConstruction(slug: string): boolean {
  return (LOCKED_PRACTICE_TEST_SLUGS as readonly string[]).includes(slug);
}

// Student-facing drill locks. Admins retain access for QA.
const LOCKED_DRILL_SLUGS = [
  "targeted-math",
  "word-scan",
  "ai-math",
] as const;

export function isDrillUnderConstruction(slug: string): boolean {
  return (LOCKED_DRILL_SLUGS as readonly string[]).includes(slug);
}
