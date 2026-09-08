import { notFound, redirect } from "next/navigation";
import { ReadingWritingBankRunner } from "@/components/ultimate/question-bank/math/MathBankRunner";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import {
  newOrderSeed,
  parseCompletionFilter,
  parseOrderSeed,
  parseQuestionOrder,
  parseDifficultyFilter,
  parseQuestionLimit,
  parseSavedFilter,
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
    savedOnly: parseSavedFilter(readParam(params.saved)),
  };
  const limit = parseQuestionLimit(readParam(params.limit));
  // A random session is dealt once and then kept: the seed rides in the URL so
  // a refresh or a back button re-deals the same order instead of renumbering
  // questions the student has already answered. Assigning it needs a round
  // trip, but only on the first arrival -- afterwards the seed is already here.
  const order = parseQuestionOrder(readParam(params.order));
  const shuffleSeed = parseOrderSeed(readParam(params.seed));
  if (order === "random" && shuffleSeed === null) {
    redirect(`/ultimate/bank/reading-writing/practice?${withOrderSeed(params, newOrderSeed())}`);
  }
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
    shuffleSeed: order === "random" ? shuffleSeed : null,
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

// Every filter the student arrived with, plus the seed just dealt for them.
function withOrderSeed(
  params: Record<string, string | string[] | undefined>,
  seed: number,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "seed") continue;
    if (typeof value === "string") next.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) next.append(key, entry);
  }
  next.set("seed", String(seed));
  return next.toString();
}
