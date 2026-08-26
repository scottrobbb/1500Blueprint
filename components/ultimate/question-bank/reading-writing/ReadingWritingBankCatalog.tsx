"use client";

import SubjectBankCatalogView from "@/components/ultimate/question-bank/math/MathBankCatalog";
import {
  READING_WRITING_DOMAINS,
  type ReadingWritingBankCatalog,
} from "@/lib/question-bank/reading-writing";
import type { PlanCode } from "@/lib/auth/plans";

export function ReadingWritingBankCatalogView({
  catalog,
  challengeLocked,
  currentPlan,
}: {
  catalog: ReadingWritingBankCatalog;
  challengeLocked: boolean;
  currentPlan: PlanCode;
}) {
  return (
    <SubjectBankCatalogView
      catalog={catalog}
      domains={READING_WRITING_DOMAINS}
      subjectTitle="Reading & Writing"
      skillCount={10}
      basePath="/ultimate/bank/reading-writing"
      challengeLocked={challengeLocked}
      currentPlan={currentPlan}
    />
  );
}
