import "server-only";

import { isAdminEmail } from "./admin";
import { getDrillUsageThisMonth, getDrillUsageToday, getQuestionBankUsage, getStudentAccess } from "./entitlements";
import { listTests } from "@/lib/sat/loadTest";

// Max's drill limit displays as "Unlimited" (see plan-view.ts / PLAN_ENTITLEMENTS)
// and stays that way in every response below — this cap is a hidden cost/abuse
// backstop, not a product tier boundary, so it must never surface as a number.
const MAX_HIDDEN_MONTHLY_DRILL_CAP = 500;

// Practice Test 1 is a free sample for every signed-in student regardless of
// plan -- keyed by slug (not list position) so it stays free even if tests are
// reordered, renamed, or renumbered later.
export const FREE_PRACTICE_TEST_SLUG = "practice-test-1";

// Pure boundary decision, isolated from the Supabase-backed lookups above so
// the free/core/max cutoffs can be unit tested without a DB.
export function testIndexIsAccessible(
  testSlug: string,
  testIndex: number,
  fullTestLimit: number | "unlimited",
): boolean {
  if (testIndex < 0) return false;
  if (testSlug === FREE_PRACTICE_TEST_SLUG) return true;
  // Max reads the catalog rather than a cap, so publishing a test releases it
  // to Max without a matching entitlement bump.
  if (fullTestLimit === "unlimited") return true;
  return testIndex < fullTestLimit;
}

export async function canAccessPracticeTest(email: string, testSlug: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const [access, tests] = await Promise.all([getStudentAccess(email), listTests()]);
  if (!access.active) return false;
  const testIndex = tests.findIndex((test) => test.slug === testSlug);
  return testIndexIsAccessible(testSlug, testIndex, access.entitlements.fullTestLimit);
}

export async function questionBankAllowance(email: string): Promise<{ allowed: boolean; used: number; limit: number | "unlimited" }> {
  if (isAdminEmail(email)) return { allowed: true, used: 0, limit: "unlimited" };
  const access = await getStudentAccess(email);
  const limit = access.entitlements.questionBankLimit;
  // Free's content exposure is bounded by the curated free-tier pool (see
  // freeTierOnly filtering in lib/question-bank/*-queries.ts), not by a
  // submission counter -- so Free is never locked out of the bank once a raw
  // attempt count crosses the pool size (which would otherwise happen quickly
  // from ordinary retries). Core and Max get the whole bank with no cap at
  // all; this numeric branch is kept for any future metered plan.
  if (limit === "unlimited" || access.plan === "free") return { allowed: access.active, used: 0, limit };
  const used = await getQuestionBankUsage(email);
  return { allowed: access.active && used < limit, used, limit };
}

export async function drillAllowance(email: string): Promise<{ allowed: boolean; used: number; limit: number | "unlimited" | null }> {
  if (isAdminEmail(email)) return { allowed: true, used: 0, limit: "unlimited" };
  const access = await getStudentAccess(email);
  const limit = access.entitlements.dailyDrillLimit;
  if (!access.active || limit === null) return { allowed: false, used: 0, limit };
  if (limit === "unlimited") {
    const usedThisMonth = await getDrillUsageThisMonth(email);
    return { allowed: usedThisMonth < MAX_HIDDEN_MONTHLY_DRILL_CAP, used: 0, limit };
  }
  const used = await getDrillUsageToday(email);
  return { allowed: used < limit, used, limit };
}
