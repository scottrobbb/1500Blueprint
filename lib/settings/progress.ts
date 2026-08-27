export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 20;

export function parseDailyGoal(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_DAILY_GOAL || parsed > MAX_DAILY_GOAL) return null;
  return parsed;
}
