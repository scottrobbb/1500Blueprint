import { notFound, redirect } from "next/navigation";
import { ReadingWritingBankRunner } from "@/components/ultimate/question-bank/math/MathBankRunner";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  parseCompletionFilter,
  parseDifficultyFilter,
  parseQuestionLimit,
  parseSkillFilter,
  pinnedQuestionBankSession,
} from "@/lib/question-bank/math";
import { getReadingWritingRunnerQuestions } from "@/lib/question-bank/reading-writing-queries";
import { getQuestionBankRunnerState } from "@/lib/question-bank/runner-state";
import {
  pinPlannerTaskQuestions,
  resolvePlannerTaskSession,
} from "@/lib/study-planner/task-questions";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { questionBankAllowance } from "@/lib/auth/access-control";
import { BluebookSurface } from "@/components/theme/BluebookSurface";

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
  const limit = parseQuestionLimit(readParam(params.limit));
  const fromPlanner = readParam(params.from) === "planner";
  const [access, allowance] = await Promise.all([
    getStudentAccess(session.email),
    questionBankAllowance(session.email),
  ]);
  if (!allowance.allowed) redirect("/ultimate/bank?upgrade=1");
  // A Study Planner task owns a fixed set of questions: opening it a second
  // time has to hand back the same ones, with the ones already answered still
  // answered, rather than re-running the filters over what is left.
  const plannerTask = fromPlanner
    ? await resolvePlannerTaskSession(session.email, readParam(params.task), "rw")
    : null;
  const selected = await getReadingWritingRunnerQuestions(session.email, filters, limit, {
    includeChallenge: access.entitlements.challengeQuestions,
    freeTierOnly: access.plan === "free",
    pin: plannerTask?.pin,
  });
  const questions = plannerTask?.pin.mode === "resume"
    ? pinnedQuestionBankSession(
      selected,
      await pinPlannerTaskQuestions(plannerTask.taskId, selected.map((question) => question.id)),
    )
    : selected;
  const initialState = await getQuestionBankRunnerState(session.email, questions.map((question) => question.id));

  return (
    <BluebookSurface>
      <ReadingWritingBankRunner
        questions={questions}
        filters={filters}
        initialState={initialState}
        returnHref={fromPlanner ? "/ultimate/planner" : undefined}
        plannerTaskId={plannerTask?.taskId}
        isAdmin={isAdminEmail(session.email)}
      />
    </BluebookSurface>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
