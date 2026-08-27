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
    "Equivalent Expressions": 15,
    "Nonlinear Equations in One Variable and Systems of Equations in Two Variables": 6,
    "Nonlinear Functions": 23,
    "Ratios, Rates, Proportional Relationships, and Units": 23,
    "Percentages": 21,
    "One-Variable Data: Distributions and Measures of Center and Spread": 21,
    "Two-Variable Data: Models and Scatterplots": 10,
    "Probability and Conditional Probability": 10,
    "Inference from Sample Statistics and Margin of Error": 10,
    "Evaluating Statistical Claims: Observational Studies and Experiments": 8,
    "Area and Volume": 19,
    "Lines, Angles, and Triangles": 19,
    "Right Triangles and Trigonometry": 16,
    "Circles": 13,
  },
  "reading-writing-subtopic-course": {
    "Pacing and General Reading Tips": 7,
    "How to R-A-P: Read, Analyze, Predict": 7,
    "Words in Context": 11,
    "Cross-Text Connections": 16,
    "Text Structure and Purpose": 12,
    "Central Ideas and Details": 16,
    "Command of Evidence": 14,
    "Inferences": 16,
    "Boundaries": 15,
    "Form, Structure, and Sense": 10,
    "Transitions": 8,
    "Rhetorical Synthesis": 6,
  },
};

export function lessonDurationMinutes(courseSlug: string, lesson: { title: string; estimatedMinutes: number }): number {
  return DURATION_OVERRIDE_MINUTES[courseSlug]?.[lesson.title] ?? (lesson.estimatedMinutes || 5);
}
