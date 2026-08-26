// Manual corrections for lesson durations that are wrong in the database
// (imported with a flat 15-minute placeholder instead of the real video
// length). Keyed by course slug, then exact lesson title. Remove an entry
// once its course_lessons.estimated_minutes row is fixed for real.
const DURATION_OVERRIDE_MINUTES: Record<string, Record<string, number>> = {
  "math-subtopic-course": {
    "How to Use This Course": 3,
    "Pacing on Math": 2,
    "Priorities Below a 1000 SAT Score": 5,
    "Priorities for a 1000–1290 SAT Score": 5,
    "Priorities for a 1300+ SAT Score": 5,
    "Linear Equations in One Variable": 21,
    "Linear Functions": 18,
    "Linear Equations in Two Variables": 19,
    "Systems of Two Linear Equations in Two Variables": 12,
    "Linear Inequalities in One or Two Variables": 18,
  },
};

export function lessonDurationMinutes(courseSlug: string, lesson: { title: string; estimatedMinutes: number }): number {
  return DURATION_OVERRIDE_MINUTES[courseSlug]?.[lesson.title] ?? (lesson.estimatedMinutes || 5);
}
