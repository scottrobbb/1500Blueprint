export type PlanCode = "free" | "core" | "max";
export type AccessSource = "free" | "legacy" | "subscription" | "grant";

export type PlanEntitlements = {
  questionBankLimit: number | "unlimited";
  fullTestLimit: number;
  dailyDrillLimit: number | "unlimited" | null;
  desmos101: boolean;
  readingWriting101: boolean;
  challengeQuestions: boolean;
  allCourses: boolean;
  liveGroupClasses: boolean;
  studyPlanner: boolean;
  flashcards: boolean;
  discordRole: "core" | "max" | null;
};

export type StudentAccess = {
  active: boolean;
  accountId: string | null;
  accountStatus: "active" | "suspended" | "archived";
  isTestAccount: boolean;
  plan: PlanCode;
  source: AccessSource;
  entitlements: PlanEntitlements;
};

export const PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlements> = {
  free: {
    questionBankLimit: 200,
    fullTestLimit: 1,
    dailyDrillLimit: null,
    desmos101: true,
    readingWriting101: true,
    challengeQuestions: false,
    allCourses: false,
    liveGroupClasses: false,
    studyPlanner: false,
    flashcards: false,
    discordRole: null,
  },
  core: {
    questionBankLimit: "unlimited",
    fullTestLimit: 2,
    dailyDrillLimit: 20,
    desmos101: true,
    readingWriting101: true,
    challengeQuestions: true,
    allCourses: false,
    liveGroupClasses: false,
    studyPlanner: false,
    flashcards: false,
    discordRole: "core",
  },
  max: {
    questionBankLimit: "unlimited",
    fullTestLimit: 4,
    dailyDrillLimit: "unlimited",
    desmos101: true,
    readingWriting101: true,
    challengeQuestions: true,
    allCourses: true,
    liveGroupClasses: true,
    studyPlanner: true,
    flashcards: true,
    discordRole: "max",
  },
};

export function normalizePlanCode(value: string | null | undefined): PlanCode {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "max" || normalized.includes("max")) return "max";
  if (normalized === "core" || normalized.includes("core")) return "core";
  return "free";
}

// Everything the app is allowed to WRITE to users.plan. Keeping this a closed
// union is what stops the original defect: getMembership used to store a Stripe
// price nickname (or, with no nickname, the raw price id) into this field, and
// normalizeLegacyPlanCode quietly read that back as "free" -- dropping active
// paying members to the free tier. A display string is now a type error.
export const LEGACY_PLAN_SENTINELS = ["testing", "complimentary", "admin", "dev"] as const;
export type LegacyPlanSentinel = (typeof LEGACY_PLAN_SENTINELS)[number];
export type StoredPlan = PlanCode | LegacyPlanSentinel;

export function isLegacyPlanSentinel(value: string): value is LegacyPlanSentinel {
  return (LEGACY_PLAN_SENTINELS as readonly string[]).includes(value);
}

// Reading stays permissive -- rows written before the type existed still hold
// nicknames and price ids. Use storedPlanIsUnreadable to tell a genuine "free"
// apart from a value this could not parse.
export function normalizeLegacyPlanCode(value: string | null | undefined): PlanCode {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isLegacyPlanSentinel(normalized)) return "max";
  return normalizePlanCode(value);
}

// True when users.plan holds something this cannot interpret. Such a value
// means the account's real entitlement is unknown -- never that it is free.
export function storedPlanIsUnreadable(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  if (isLegacyPlanSentinel(normalized)) return false;
  return normalizePlanCode(normalized) === "free" && normalized !== "free";
}

export function highestPlan(...plans: PlanCode[]): PlanCode {
  const rank: Record<PlanCode, number> = { free: 0, core: 1, max: 2 };
  return plans.reduce((highest, plan) => rank[plan] > rank[highest] ? plan : highest, "free");
}

export function effectivePlan(
  grant: PlanCode | null,
  subscription: PlanCode | null,
  legacy: PlanCode,
  hasTrackedSubscription = subscription !== null,
): PlanCode {
  if (grant || subscription) return highestPlan(grant ?? "free", subscription ?? "free");
  return hasTrackedSubscription ? "free" : legacy;
}

export function accessForPlan(
  plan: PlanCode,
  source: AccessSource,
  accountId: string | null,
  active = true,
  accountStatus: StudentAccess["accountStatus"] = active ? "active" : "suspended",
  isTestAccount = false,
): StudentAccess {
  return {
    active,
    accountId,
    accountStatus,
    isTestAccount,
    plan,
    source,
    entitlements: PLAN_ENTITLEMENTS[plan],
  };
}

export function canAccessCourse(access: StudentAccess, courseSlug: string): boolean {
  if (!access.active) return false;
  return hasCourseAccess(access.entitlements, courseSlug);
}

export function accessForTestPersona(
  persona: string | null | undefined,
  accountId: string,
): StudentAccess | null {
  if (persona === "suspended") return accessForPlan("free", "legacy", accountId, false, "suspended", true);
  if (persona === "free" || persona === "core" || persona === "max") {
    return accessForPlan(persona, "legacy", accountId, true, "active", true);
  }
  return null;
}

// Free courses (available on every plan) are keyed by the entitlement flag
// that gates them. Everything else (Blueprint Foundations, subtopic courses)
// requires allCourses (Max).
const FREE_COURSE_ENTITLEMENTS: Record<string, keyof PlanEntitlements> = {
  "desmos-101": "desmos101",
  "reading-101": "readingWriting101",
};

export function hasCourseAccess(entitlements: PlanEntitlements, courseSlug: string): boolean {
  if (entitlements.allCourses) return true;
  const flag = FREE_COURSE_ENTITLEMENTS[courseSlug];
  return flag ? Boolean(entitlements[flag]) : false;
}
