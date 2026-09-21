// What "delete my account" actually touches.
//
// The plan is data rather than code so it can be read, reviewed, and tested
// without a database. Two rules decide which list a table belongs in:
//
//   - Anything the student produced or that identifies them is erased.
//   - Money is kept. Subscriptions, checkout intents, and refunds stay, still
//     pointing at the same user row, because they are the record of what was
//     charged. The PII is removed from that row instead (see anonymizedEmail),
//     so what survives is an amount and a date, not a person.
//
// The users row itself is anonymized, never deleted: every billing table
// references it with `on delete cascade`, so deleting it would take the revenue
// history with it, and question_reports references it with `on delete restrict`,
// which would block the delete outright for anyone who ever reported a question.

export type OwnedTable = { table: string; column: string };

// Erased. Ordered children-first where a foreign key would otherwise complain;
// the rest is alphabetical.
export const ERASED_TABLES: readonly OwnedTable[] = [
  // Study history.
  { table: "test_attempts", column: "email" },
  { table: "module_attempts", column: "email" },
  { table: "test_sessions", column: "email" },
  { table: "question_bank_attempts", column: "email" },
  { table: "question_bank_saves", column: "email" },
  { table: "drill_attempts", column: "email" },
  { table: "drill_question_attempts", column: "email" },
  { table: "drill_question_progress", column: "email" },
  { table: "course_practice_attempts", column: "email" },
  { table: "course_lesson_completions", column: "email" },
  { table: "dense_reading_sessions", column: "email" },
  { table: "reading_generated_passages", column: "email" },
  // Planner rows cascade from the profile, but naming them keeps the erasure
  // true even if a plan is ever created without one.
  { table: "study_planner_plans", column: "email" },
  { table: "study_planner_profiles", column: "email" },
  // Flashcard cards cascade from their set.
  { table: "flashcard_sets", column: "email" },
  // Community presence.
  { table: "community_likes", column: "email" },
  { table: "community_comments", column: "author_email" },
  { table: "community_posts", column: "email" },
  { table: "community_notifications", column: "recipient_email" },
  { table: "community_notifications", column: "actor_email" },
  // Progress, rewards, and usage counters.
  { table: "user_achievements", column: "email" },
  { table: "xp_events", column: "email" },
  { table: "student_recent_activity", column: "email" },
  { table: "ai_monthly_usage", column: "email" },
  // Access and sign-in.
  { table: "access_grants", column: "user_id" },
  { table: "login_tokens", column: "email" },
  { table: "staff_roles", column: "email" },
  // Ad attribution. Personal data about where the visit came from, and not
  // part of the revenue record.
  { table: "marketing_attribution", column: "email" },
  { table: "marketing_conversion_events", column: "email" },
  { table: "free_signup_attribution", column: "email" },
];

// Kept, and why. Nothing here is written during a deletion; they survive by
// pointing at the anonymized users row.
export const RETAINED_TABLES: Readonly<Record<string, string>> = {
  student_subscriptions: "What was charged, and on which plan.",
  billing_checkout_intents: "The purchase trail behind a subscription.",
  billing_refunds: "Refunds already issued, for accounting.",
  billing_webhook_events: "Stripe's own delivery log, keyed by Stripe ids rather than by student.",
  question_reports: "Moderation history for a question, anonymized by the users row it points at.",
};

export const ANONYMIZED_NAME = "Deleted account";

// A syntactically valid address at a reserved TLD (RFC 2606), so nothing can
// route to it and the original address is freed for a fresh signup.
export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

export function isAnonymizedEmail(email: string): boolean {
  return /^deleted-.+@deleted\.invalid$/.test(email.trim().toLowerCase());
}
