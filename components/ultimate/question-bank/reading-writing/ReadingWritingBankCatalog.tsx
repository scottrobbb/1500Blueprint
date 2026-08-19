"use client";

import { SubjectBankCatalogView } from "@/components/ultimate/question-bank/math/MathBankCatalog";
import {
  READING_WRITING_DOMAINS,
  type ReadingWritingBankCatalog,
} from "@/lib/question-bank/reading-writing";

export function ReadingWritingBankCatalogView({
  catalog,
}: {
  catalog: ReadingWritingBankCatalog;
}) {
  return (
    <SubjectBankCatalogView
      catalog={catalog}
      domains={READING_WRITING_DOMAINS}
      subjectTitle="Reading & Writing"
      skillCount={10}
      basePath="/ultimate/bank/reading-writing"
    />
  );
}
