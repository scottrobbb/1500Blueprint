import "server-only";

import { isAdminEmail } from "./admin";
import { getDrillUsageThisMonth, getDrillUsageToday, getQuestionBankUsage, getStudentAccess } from "./entitlements";
import { listTests } from "@/lib/sat/loadTest";

// Max's drill limit displays as "Unlimited" (see plan-view.ts / PLAN_ENTITLEMENTS)
// and stays that way in every response below — this cap is a hidden cost/abuse
// backstop, not a product tier boundary, so it must never surface as a number.
const MAX_HIDDEN_MONTHLY_DRILL_CAP = 500;

export async function canAccessPracticeTest(email: string, testSlug: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const [access, tests] = await Promise.all([getStudentAccess(email), listTests()]);
  if (!access.active) return false;
  const testIndex = tests.findIndex((test) => test.slug === testSlug);
  return testIndex >= 0 && testIndex < access.entitlements.fullTestLimit;
}

export async function questionBankAllowance(email: string): Promise<{ allowed: boolean; used: number; limit: number | "unlimited" }> {
  if (isAdminEmail(email)) return { allowed: true, used: 0, limit: "unlimited" };
  const access = await getStudentAccess(email);
  const limit = access.entitlements.questionBankLimit;
  if (limit === "unlimited") return { allowed: access.active, used: 0, limit };
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
