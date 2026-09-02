import type { Metadata } from "next";
import { PricingLanding } from "@/app/pricing/PricingLanding";
import { freeFaq, freeHeroChecklist, freePlanFootnote } from "@/app/pricing/landing-content";

export const metadata: Metadata = {
  title: "Free Plan | 1500 Blueprint",
  description:
    "Start digital SAT prep for free: a full-length adaptive practice test, 200 Question Bank questions, and the Desmos 101 and Reading & Writing 101 courses.",
  alternates: { canonical: "/free" },
};

export default async function FreeLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; plan?: string; cadence?: string }>;
}) {
  return (
    <PricingLanding
      visiblePlans={["free"]}
      heroChecklist={freeHeroChecklist}
      insideHeadingLead="Everything You Need to Start Preparing for the"
      insideHeadingHighlight="SAT"
      planFootnote={freePlanFootnote}
      faq={freeFaq}
      showSavings={false}
      searchParams={await searchParams}
    />
  );
}
