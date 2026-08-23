export const SAT_WEEKEND_DATES = [
  "2026-08-22",
  "2026-09-12",
  "2026-10-03",
  "2026-11-07",
  "2026-12-05",
  "2027-03-06",
  "2027-05-01",
  "2027-06-05",
  "2027-08-28",
  "2027-09-18",
  "2027-10-02",
  "2027-11-06",
  "2027-12-04",
  "2028-03-04",
  "2028-05-06",
  "2028-06-03",
] as const;

export function upcomingSatDates(today: string): string[] {
  return SAT_WEEKEND_DATES.filter((date) => date > today);
}
