import { supabaseAdmin } from "@/utils/supabase/admin";

export type StudyPlannerProfile = {
  testDate: string;
  currentScore: number | null;
  goalScore: number;
  studyDays: number[];
  practiceTestDay: number;
  lastScorePromptAttemptId: string | null;
};

type ProfileRow = {
  test_date: string;
  current_score: number | null;
  goal_score: number;
  study_days: number[];
  practice_test_day: number;
  last_score_prompt_attempt_id: string | null;
};

function fromRow(row: ProfileRow): StudyPlannerProfile {
  return {
    testDate: row.test_date,
    currentScore: row.current_score,
    goalScore: row.goal_score,
    studyDays: row.study_days,
    practiceTestDay: row.practice_test_day,
    lastScorePromptAttemptId: row.last_score_prompt_attempt_id,
  };
}

export async function getStudyPlannerProfile(email: string): Promise<StudyPlannerProfile | null> {
  const { data, error } = await supabaseAdmin()
    .from("study_planner_profiles")
    .select("test_date,current_score,goal_score,study_days,practice_test_day,last_score_prompt_attempt_id")
    .eq("email", email)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data ? fromRow(data) : null;
}
