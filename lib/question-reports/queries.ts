import "server-only";

import type {
  QuestionReportTargetType,
  QuestionReportType,
} from "./input";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type QuestionReportStatus = "open" | "resolved" | "dismissed";

export type AdminQuestionReport = {
  id: string;
  targetType: QuestionReportTargetType;
  reportType: QuestionReportType;
  comment: string;
  status: QuestionReportStatus;
  reporterEmail: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  question: {
    id: string;
    prompt: string;
    passage: string | null;
    context: string;
    targetPath: string | null;
  };
};

type ReportRow = {
  id: string;
  drill_question_id: string | null;
  practice_test_question_id: string | null;
  report_type: string;
  comment: string;
  status: string;
  reporter_email: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by_email: string | null;
};

type DrillQuestionRow = {
  id: string;
  drill_slug: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  stem: string | null;
  passage: string | null;
};

type PracticeTestQuestionRow = {
  id: string;
  position: number;
  domain: string | null;
  skill: string | null;
  prompt: string;
  passage: string | null;
  modules: {
    section: string;
    order: number;
    variant: string;
    tests: { slug: string; title: string } | null;
  } | null;
};

export async function questionReportTargetExists(
  targetType: QuestionReportTargetType,
  questionId: string,
): Promise<boolean> {
  const table = targetType === "question-bank" ? "drill_questions" : "questions";
  let query = supabaseAdmin().from(table).select("id").eq("id", questionId);
  if (targetType === "question-bank") query = query.eq("status", "published");
  const { data, error } = await query.maybeSingle<{ id: string }>();
  if (error) throw new Error(`Could not validate reported question: ${error.message}`);
  return Boolean(data);
}

export async function createQuestionReport(input: {
  targetType: QuestionReportTargetType;
  questionId: string;
  reportType: QuestionReportType;
  comment: string;
  reporterEmail: string;
  reporterAuthUserId: string | null;
}): Promise<{ id: string }> {
  const targetColumns = input.targetType === "question-bank"
    ? { drill_question_id: input.questionId, practice_test_question_id: null }
    : { drill_question_id: null, practice_test_question_id: input.questionId };
  const { data, error } = await supabaseAdmin()
    .from("question_reports")
    .insert({
      ...targetColumns,
      report_type: input.reportType,
      comment: input.comment,
      reporter_email: input.reporterEmail,
      reporter_auth_user_id: input.reporterAuthUserId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Could not create question report: ${error?.message ?? "no row returned"}`);
  return data;
}

export async function listQuestionReports(limit = 500): Promise<AdminQuestionReport[]> {
  const { data, error } = await supabaseAdmin()
    .from("question_reports")
    .select(
      "id,drill_question_id,practice_test_question_id,report_type,comment,status," +
        "reporter_email,created_at,resolved_at,resolved_by_email",
    )
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReportRow[]>();
  if (error) throw new Error(`Could not list question reports: ${error.message}`);

  const rows = data ?? [];
  const drillIds = rows.flatMap((row) => row.drill_question_id ? [row.drill_question_id] : []);
  const practiceIds = rows.flatMap((row) => (
    row.practice_test_question_id ? [row.practice_test_question_id] : []
  ));
  const [drillQuestions, practiceQuestions] = await Promise.all([
    loadDrillQuestions(drillIds),
    loadPracticeTestQuestions(practiceIds),
  ]);
  const drillById = new Map(drillQuestions.map((question) => [question.id, question]));
  const practiceById = new Map(practiceQuestions.map((question) => [question.id, question]));

  return rows.map((row) => {
    if (row.drill_question_id) {
      const question = drillById.get(row.drill_question_id);
      return toAdminReport(row, "question-bank", {
        id: row.drill_question_id,
        prompt: question?.stem?.trim() || question?.passage?.trim() || "Question content unavailable",
        passage: question?.passage ?? null,
        context: question ? drillContext(question) : "Question bank",
        targetPath: question ? `/questions/${question.id}` : null,
      });
    }

    const questionId = row.practice_test_question_id ?? "";
    const question = practiceById.get(questionId);
    const test = question?.modules?.tests;
    return toAdminReport(row, "practice-test", {
      id: questionId,
      prompt: question?.prompt?.trim() || "Question content unavailable",
      passage: question?.passage ?? null,
      context: question ? practiceContext(question) : "Practice test",
      targetPath: question && test?.slug ? `/tests/${test.slug}/questions/${question.id}` : null,
    });
  });
}

export async function updateQuestionReportStatus(
  id: string,
  status: QuestionReportStatus,
  adminEmail: string,
): Promise<void> {
  const resolved = status !== "open";
  const { data, error } = await supabaseAdmin()
    .from("question_reports")
    .update({
      status,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by_email: resolved ? adminEmail : null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`Could not update question report: ${error.message}`);
  if (!data) throw new QuestionReportNotFoundError();
}

export class QuestionReportNotFoundError extends Error {
  constructor() {
    super("Question report not found");
    this.name = "QuestionReportNotFoundError";
  }
}

async function loadDrillQuestions(ids: string[]): Promise<DrillQuestionRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("drill_questions")
    .select("id,drill_slug,section,domain,skill,stem,passage")
    .in("id", ids)
    .returns<DrillQuestionRow[]>();
  if (error) throw new Error(`Could not load reported question-bank items: ${error.message}`);
  return data ?? [];
}

async function loadPracticeTestQuestions(ids: string[]): Promise<PracticeTestQuestionRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("questions")
    .select(
      "id,position,domain,skill,prompt,passage," +
        "modules(section,order,variant,tests(slug,title))",
    )
    .in("id", ids)
    .returns<PracticeTestQuestionRow[]>();
  if (error) throw new Error(`Could not load reported practice-test questions: ${error.message}`);
  return data ?? [];
}

function toAdminReport(
  row: ReportRow,
  targetType: QuestionReportTargetType,
  question: AdminQuestionReport["question"],
): AdminQuestionReport {
  return {
    id: row.id,
    targetType,
    reportType: row.report_type as QuestionReportType,
    comment: row.comment,
    status: row.status as QuestionReportStatus,
    reporterEmail: row.reporter_email,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedByEmail: row.resolved_by_email,
    question,
  };
}

function drillContext(question: DrillQuestionRow): string {
  const details = [question.section === "rw" ? "Reading & Writing" : question.section === "math" ? "Math" : null, question.domain, question.skill]
    .filter(Boolean);
  return [humanize(question.drill_slug), ...details].join(" · ");
}

function practiceContext(question: PracticeTestQuestionRow): string {
  const targetModule = question.modules;
  const section = targetModule?.section === "rw" ? "Reading & Writing" : "Math";
  const variant = targetModule?.order === 2 ? ` (${humanize(targetModule.variant)})` : "";
  return [
    targetModule?.tests?.title ?? "Practice test",
    targetModule ? `${section} module ${targetModule.order}${variant}` : null,
    `Question ${question.position}`,
    question.skill,
  ].filter(Boolean).join(" · ");
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
