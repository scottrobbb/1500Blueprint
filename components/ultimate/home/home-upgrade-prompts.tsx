import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";

type UpgradeConfig = {
  title: string;
  description: string;
  features: string[];
};

const UPGRADE_BY_PLAN: Partial<Record<PlanCode, UpgradeConfig>> = {
  free: {
    title: "Unlock the full practice loop",
    description: "Keep your free course and diagnostic, then add the daily repetition that turns weak skills into reliable points.",
    features: ["Unlimited daily drills", "Challenge Question sets", "5 full-length tests"],
  },
  core: {
    title: "Add Scott's complete weekly system",
    description: "Move from practice access to an adaptive plan, every advanced course, and live support with Scott.",
    features: ["Personal study planner", "Every advanced course", "Weekly live calls"],
  },
};

export function HomeUpgradePrompts({ plan }: { plan: PlanCode }) {
  const config = UPGRADE_BY_PLAN[plan];
  if (!config) return null;

  return (
    <UpgradePrompt
      currentPlan={plan}
      requiredPlan="max"
      title={config.title}
      description={config.description}
      features={config.features}
      className="mb-7 !shadow-none"
    />
  );
}
