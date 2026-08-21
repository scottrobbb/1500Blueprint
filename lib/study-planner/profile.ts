import { supabaseAdmin } from "@/utils/supabase/admin";

export type StudyPlannerProfile = {
  testDate: string;
  currentScore: number | null;
  scoreUpdatedAt: string | null;
  goalScore: number;
  studyDays: number[];
  practiceTestDay: number;
  dailyMinutes: number;
  activePlanId: string | null;
  lastScorePromptAttemptId: string | null;
  updatedAt: string;
};

type ProfileRow = {
  test_date: string;
  current_score: number | null;
  score_updated_at: string | null;
  goal_score: number;
  study_days: number[];
  practice_test_day: number;
  daily_minutes: number;
  active_plan_id: string | null;
  last_score_prompt_attempt_id: string | null;
  updated_at: string;
};

function fromRow(row: ProfileRow): StudyPlannerProfile {
  return {
    testDate: row.test_date,
    currentScore: row.current_score,
    scoreUpdatedAt: row.score_updated_at,
    goalScore: row.goal_score,
    studyDays: row.study_days,
    practiceTestDay: row.practice_test_day,
    dailyMinutes: row.daily_minutes,
    activePlanId: row.active_plan_id,
    lastScorePromptAttemptId: row.last_score_prompt_attempt_id,
    updatedAt: row.updated_at,
  };
}

export async function getStudyPlannerProfile(email: string): Promise<StudyPlannerProfile | null> {
  const { data, error } = await supabaseAdmin()
    .from("study_planner_profiles")
    .select("test_date,current_score,score_updated_at,goal_score,study_days,practice_test_day,daily_minutes,active_plan_id,last_score_prompt_attempt_id,updated_at")
    .eq("email", email)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data ? fromRow(data) : null;
}
