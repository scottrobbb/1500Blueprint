// The confirmed SAT administrations, in order. August 2026 has been and gone;
// nothing past May 2027 is listed because nothing past it is confirmed. When
// the list runs out every caller falls back on its own: the planner opens its
// custom-date field, study preferences default to today, and the pricing
// countdown hides itself rather than counting down to a guess.
export const SAT_WEEKEND_DATES = [
  "2026-09-12",
  "2026-10-03",
  "2026-11-07",
  "2026-12-05",
  "2027-03-06",
  "2027-05-01",
] as const;

export function upcomingSatDates(today: string): string[] {
  return SAT_WEEKEND_DATES.filter((date) => date > today);
}
