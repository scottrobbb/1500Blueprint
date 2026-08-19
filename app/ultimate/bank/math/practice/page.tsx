import { notFound } from "next/navigation";
import { MathBankRunner } from "@/components/ultimate/question-bank/math/MathBankRunner";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  parseCompletionFilter,
  parseDifficultyFilter,
  parseSkillFilter,
} from "@/lib/question-bank/math";
import { getMathRunnerQuestions } from "@/lib/question-bank/math-queries";

export const metadata = { title: "Math Practice" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UltimateMathPracticePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const params = await searchParams;
  const filters = {
    skills: parseSkillFilter(readParam(params.skills)),
    difficulty: parseDifficultyFilter(readParam(params.difficulty)),
    completion: parseCompletionFilter(readParam(params.completion)),
  };
  const questions = await getMathRunnerQuestions(session.email, filters);

  return <MathBankRunner questions={questions} filters={filters} />;
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
