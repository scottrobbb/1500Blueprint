// Server-only: active time on the site per Eastern day, plus the per-day
// activity already recorded elsewhere. Uses the service-role client; callers
// authorize first.

import "server-only";
import { dateKey, dayStart, shiftKey } from "@/lib/gamification/engine";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type DailyActivity = {
  day: string; // YYYY-MM-DD, Eastern
  activeSeconds: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  questions: number; // Question Bank questions + drill attempts
  tests: number; // full tests + single modules
  lessons: number;
};

export type ActivityHistory = {
  days: DailyActivity[]; // oldest first, one per day in the window
  // Time tracking has no rows yet, or its table is not migrated. The activity
  // counts still work, so the view can say so instead of showing zeros as fact.
  trackingAvailable: boolean;
  trackingSince: string | null;
};

export async function recordActiveTime(email: string, seconds: number): Promise<void> {
  const { error } = await supabaseAdmin().rpc("record_active_time", {
    p_email: email,
    p_seconds: Math.round(seconds),
  });
  if (error) throw new Error(`Could not record active time [${error.code}]: ${error.message}`);
}

type Timestamped = { at: string };

export async function getActivityHistory(email: string, days = 30): Promise<ActivityHistory> {
  const todayKey = dateKey(new Date());
  const firstKey = shiftKey(todayKey, -(days - 1));
  const since = dayStart(firstKey).toISOString();
  const db = supabaseAdmin();

  const [tracked, trackingStart, drills, bank, tests, modules, lessons] = await Promise.all([
    db
      .from("student_daily_activity")
      .select("day,active_seconds,first_seen_at,last_seen_at")
      .eq("email", email)
      .gte("day", firstKey)
      .returns<{ day: string; active_seconds: number; first_seen_at: string; last_seen_at: string }[]>(),
    db
      .from("student_daily_activity")
      .select("day")
      .eq("email", email)
      .order("day")
      .limit(1)
      .maybeSingle<{ day: string }>(),
    timestamps("drill_attempts", "created_at", email, since),
    timestamps("question_bank_attempts", "attempted_at", email, since),
    timestamps("test_attempts", "created_at", email, since),
    timestamps("module_attempts", "created_at", email, since),
    timestamps("course_lesson_completions", "completed_at", email, since),
  ]);

  const byDay = new Map<string, DailyActivity>();
  for (let key = firstKey; key <= todayKey; key = shiftKey(key, 1)) {
    byDay.set(key, {
      day: key,
      activeSeconds: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      questions: 0,
      tests: 0,
      lessons: 0,
    });
  }
  for (const row of tracked.data ?? []) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    entry.activeSeconds = row.active_seconds;
    entry.firstSeenAt = row.first_seen_at;
    entry.lastSeenAt = row.last_seen_at;
  }
  const tally = (rows: Timestamped[], field: "questions" | "tests" | "lessons") => {
    for (const row of rows) {
      const entry = byDay.get(dateKey(new Date(row.at)));
      if (entry) entry[field] += 1;
    }
  };
  tally(drills, "questions");
  tally(bank, "questions");
  tally(tests, "tests");
  tally(modules, "tests");
  tally(lessons, "lessons");

  return {
    days: [...byDay.values()],
    trackingAvailable: !tracked.error,
    trackingSince: trackingStart.data?.day ?? null,
  };
}

// Timestamps of one student's rows since a moment, paged past the 1000-row cap.
async function timestamps(table: string, column: string, email: string, since: string): Promise<Timestamped[]> {
  const rows: Timestamped[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin()
      .from(table)
      .select(column)
      .eq("email", email)
      .gte(column, since)
      .order(column)
      .range(offset, offset + 999)
      .returns<Record<string, string>[]>();
    if (error) throw new Error(`Could not load ${table} activity [${error.code}]: ${error.message}`);
    const page = data ?? [];
    rows.push(...page.map((row) => ({ at: row[column] })));
    if (page.length < 1000) return rows;
  }
}
