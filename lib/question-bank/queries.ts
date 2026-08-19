// Server-only data access for the Ultimate Question Bank landing page.

import "server-only";
import {
  emptyQuestionBankDashboard,
  normalizeQuestionBankDashboard,
  type QuestionBankDashboard,
  type QuestionBankDifficulty,
  type QuestionBankSection,
} from "@/lib/question-bank/dashboard";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function getQuestionBankDashboard(email: string): Promise<QuestionBankDashboard> {
  const { data, error } = await supabaseAdmin().rpc("get_question_bank_dashboard", {
    p_email: email,
  });

  if (error) {
    // Keep the private preview usable while a new environment is waiting for
    // the migration. Existing objective inventory and streak data can still be
    // displayed; attempt analytics begin once the new tables are deployed.
    if (error.code !== "PGRST202") {
      console.error("Question Bank dashboard query failed", error);
    }
    return loadPreMigrationDashboard(email);
  }

  return normalizeQuestionBankDashboard(data);
}

type InventoryQuestion = {
  id: string;
  section: QuestionBankSection;
  domain: string | null;
  difficulty: QuestionBankDifficulty;
};

async function loadPreMigrationDashboard(email: string): Promise<QuestionBankDashboard> {
  const db = supabaseAdmin();
  const [readingWriting, math, user] = await Promise.all([
    db
      .from("drill_questions")
      .select("id,section,domain,difficulty")
      .eq("status", "published")
      .eq("drill_slug", "grammar")
      .eq("section", "rw")
      .eq("answer_type", "mc_single")
      .returns<InventoryQuestion[]>(),
    db
      .from("drill_questions")
      .select("id,section,domain,difficulty")
      .eq("status", "published")
      .eq("drill_slug", "targeted-math")
      .eq("created_by", "scott-math-import")
      .eq("section", "math")
      .in("answer_type", ["mc_single", "grid_in"])
      .returns<InventoryQuestion[]>(),
    db
      .from("users")
      .select("streak_current")
      .eq("email", email)
      .maybeSingle<{ streak_current: number | null }>(),
  ]);

  if (readingWriting.error || math.error) {
    console.error("Question Bank inventory fallback failed", readingWriting.error ?? math.error);
  }

  const dashboard = emptyQuestionBankDashboard();
  const questions = [...(readingWriting.data ?? []), ...(math.data ?? [])];
  dashboard.summary.streak = user.data?.streak_current ?? 0;

  for (const question of questions) {
    const subject = dashboard.subjects.find((item) => item.section === question.section);
    if (subject) subject.available += 1;

    const difficulty = dashboard.difficulty.find(
      (item) => item.section === question.section && item.difficulty === question.difficulty,
    );
    if (difficulty) difficulty.available += 1;

    const domain = question.domain?.trim() || "Other";
    const topic = dashboard.topics.find(
      (item) => item.section === question.section && item.domain === domain,
    );
    if (topic) {
      topic.available += 1;
    } else {
      dashboard.topics.push({
        section: question.section,
        domain,
        available: 1,
        attempts: 0,
        correct: 0,
        accuracy: 0,
      });
    }
  }

  return dashboard;
}
