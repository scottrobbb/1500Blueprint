import type { Metadata } from "next";
import { PricingLanding } from "@/app/pricing/PricingLanding";
import { maxFaq, maxHeroChecklist, maxPlanFootnote } from "@/app/pricing/landing-content";

export const metadata: Metadata = {
  title: "Max Plan | 1500 Blueprint",
  description:
    "1500 Blueprint Max: every full-length practice test, the full Question Bank, unlimited drills, all courses, and weekly live group calls with Scott.",
  alternates: { canonical: "/max" },
};

export default async function MaxLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; plan?: string; cadence?: string }>;
}) {
  return (
    <PricingLanding
      visiblePlans={["max"]}
      heroChecklist={maxHeroChecklist}
      insideHeadingLead="Max Includes Everything You Need to Reach"
      insideHeadingHighlight="1500+"
      planFootnote={maxPlanFootnote}
      faq={maxFaq}
      showSavings
      searchParams={await searchParams}
    />
  );
}
