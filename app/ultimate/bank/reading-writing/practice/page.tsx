import { notFound } from "next/navigation";
import { ReadingWritingBankRunner } from "@/components/ultimate/question-bank/math/MathBankRunner";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  parseCompletionFilter,
  parseDifficultyFilter,
  parseSkillFilter,
} from "@/lib/question-bank/math";
import { getReadingWritingRunnerQuestions } from "@/lib/question-bank/reading-writing-queries";

export const metadata = { title: "Reading & Writing Practice" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UltimateReadingWritingPracticePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const params = await searchParams;
  const filters = {
    skills: parseSkillFilter(readParam(params.skills)),
    difficulty: parseDifficultyFilter(readParam(params.difficulty)),
    completion: parseCompletionFilter(readParam(params.completion)),
  };
  const questions = await getReadingWritingRunnerQuestions(session.email, filters);

  return <ReadingWritingBankRunner questions={questions} filters={filters} />;
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
