import type { PlanCode, PlanEntitlements } from "@/lib/auth/plans";

export type SettingsFeatureKey =
  | "desmos101"
  | "readingWriting101"
  | "challengeQuestions"
  | "allCourses"
  | "studyPlanner"
  | "liveGroupClasses"
  | "discordRole";

export type SettingsUsageKey =
  | "questionBankLimit"
  | "fullTestLimit"
  | "dailyDrillLimit";

export type SettingsFeature = {
  key: SettingsFeatureKey;
  title: string;
  description: string;
  included: boolean;
  valueLabel?: string;
  unlockPlan?: Exclude<PlanCode, "free">;
};

export type SettingsUsageMetric = {
  key: SettingsUsageKey;
  title: string;
  description: string;
  included: boolean;
  unavailable: boolean;
  unlimited: boolean;
  used: number | null;
  limit: number | null;
  percentage: number | null;
  valueLabel: string;
  resetLabel?: string;
  unlockPlan?: Exclude<PlanCode, "free">;
};

export type SettingsPlanView = {
  features: SettingsFeature[];
  usage: SettingsUsageMetric[];
};

export type SettingsUsageValues = {
  questionBankUsed: number | null;
  drillsUsedToday: number | null;
};

// The Question Bank row only quotes a usage number for a plan that is truly
// metered. Core and Max are unlimited, and Free is bounded by the curated
// free-tier pool rather than a submission counter (see freeTierOnly filtering
// in lib/question-bank/*-queries.ts and the matching carve-out in
// questionBankAllowance) -- so neither has a count worth reading. Callers use
// this to skip the usage query entirely, which keeps the fetch and the label
// from ever disagreeing about who is metered.
export function questionBankUsageIsMetered(
  entitlements: PlanEntitlements,
  plan: PlanCode,
): boolean {
  return entitlements.questionBankLimit !== "unlimited" && plan !== "free";
}

function usagePercentage(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || limit <= 0) return null;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

export function buildSettingsPlanView(
  entitlements: PlanEntitlements,
  usage: SettingsUsageValues,
  plan: PlanCode,
): SettingsPlanView {
  const drillLimit = entitlements.dailyDrillLimit;
  const finiteDrillLimit = typeof drillLimit === "number" ? drillLimit : null;
  const drillIncluded = drillLimit !== null;
  const drillUnlimited = drillLimit === "unlimited";

  const bankLimit = entitlements.questionBankLimit;
  const finiteBankLimit = typeof bankLimit === "number" ? bankLimit : null;
  const bankUnlimited = bankLimit === "unlimited";
  // Free's row must not report an attempt allowance no part of the app
  // actually enforces -- name the curated pool it really gets instead.
  const bankSample = !bankUnlimited && !questionBankUsageIsMetered(entitlements, plan);

  return {
    usage: [
      {
        key: "questionBankLimit",
        title: "Question Bank",
        description: "Practice questions across Math and Reading & Writing.",
        included: true,
        unavailable: !bankUnlimited && !bankSample && usage.questionBankUsed === null,
        unlimited: bankUnlimited,
        used: bankUnlimited || bankSample ? null : usage.questionBankUsed,
        limit: bankSample ? null : finiteBankLimit,
        percentage: bankUnlimited || bankSample
          ? null
          : usagePercentage(usage.questionBankUsed, finiteBankLimit),
        valueLabel: bankUnlimited
          ? "Unlimited"
          : bankSample
            ? "Sample library"
            : usage.questionBankUsed === null
              ? "Usage unavailable"
              : `${usage.questionBankUsed.toLocaleString()} of ${finiteBankLimit?.toLocaleString()} attempts`,
      },
      {
        key: "fullTestLimit",
        title: "Full digital SATs",
        description: "Published full-length tests available with this plan.",
        included: entitlements.fullTestLimit > 0,
        unavailable: false,
        unlimited: false,
        used: null,
        limit: entitlements.fullTestLimit,
        percentage: null,
        valueLabel: `${entitlements.fullTestLimit} ${entitlements.fullTestLimit === 1 ? "test" : "tests"} included`,
      },
      {
        key: "dailyDrillLimit",
        title: "Targeted drills",
        description: "Focused practice sessions built around individual skills.",
        included: drillIncluded,
        unavailable:
          drillIncluded && !drillUnlimited && usage.drillsUsedToday === null,
        unlimited: drillUnlimited,
        used: drillIncluded && !drillUnlimited ? usage.drillsUsedToday : null,
        limit: finiteDrillLimit,
        percentage: usagePercentage(usage.drillsUsedToday, finiteDrillLimit),
        valueLabel: !drillIncluded
          ? "Not included"
          : drillUnlimited
            ? "Unlimited"
            : usage.drillsUsedToday === null
              ? "Usage unavailable"
              : `${usage.drillsUsedToday} of ${finiteDrillLimit} today`,
        resetLabel: finiteDrillLimit ? "Resets daily" : undefined,
        unlockPlan: drillIncluded ? undefined : "core",
      },
    ],
    features: [
      {
        key: "desmos101",
        title: "Desmos 101",
        description: "Learn the calculator workflows that save time on SAT Math.",
        included: entitlements.desmos101,
      },
      {
        key: "readingWriting101",
        title: "Reading & Writing 101",
        description: "Build a repeatable system for every Reading & Writing question type.",
        included: entitlements.readingWriting101,
      },
      {
        key: "challengeQuestions",
        title: "Challenge questions",
        description: "Practice the hardest patterns that separate strong scores from elite ones.",
        included: entitlements.challengeQuestions,
        unlockPlan: entitlements.challengeQuestions ? undefined : "core",
      },
      {
        key: "allCourses",
        title: "Every course and advanced track",
        description: "Unlock the complete strategy and skill-course library.",
        included: entitlements.allCourses,
        unlockPlan: entitlements.allCourses ? undefined : "max",
      },
      {
        key: "studyPlanner",
        title: "Personal SAT study planner",
        description: "Turn your test date, score evidence, and schedule into a weekly plan.",
        included: entitlements.studyPlanner,
        unlockPlan: entitlements.studyPlanner ? undefined : "max",
      },
      {
        key: "liveGroupClasses",
        title: "Weekly classes and recordings",
        description: "Join live group instruction and revisit the recording library.",
        included: entitlements.liveGroupClasses,
        unlockPlan: entitlements.liveGroupClasses ? undefined : "max",
      },
      {
        key: "discordRole",
        title: "Student community role",
        description: "Receive the community access level attached to your plan.",
        included: entitlements.discordRole !== null,
        valueLabel: entitlements.discordRole
          ? `${entitlements.discordRole === "max" ? "Max" : "Core"} member role`
          : undefined,
        unlockPlan: entitlements.discordRole ? undefined : "core",
      },
    ],
  };
}
