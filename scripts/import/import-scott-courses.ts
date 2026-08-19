/**
 * Import Scott's three approved Drive curricula into the Ultimate course system.
 * Source files remain in Drive and are embedded in lessons so videos, diagrams,
 * and rich notes keep their original fidelity.
 *
 * npx tsx --env-file=.env.local scripts/import/import-scott-courses.ts
 * npx tsx --env-file=.env.local scripts/import/import-scott-courses.ts --write
 */
import * as crypto from "node:crypto";
import { saveCourse } from "../../lib/courses/queries";
import type { CourseInput, CourseModule, LessonBlock } from "../../lib/courses/types";

type SourceLesson = {
  title: string;
  video?: string;
  notes?: string;
  resources?: { title: string; id: string; kind: "document" | "spreadsheet" }[];
};

type SourceModule = {
  title: string;
  description: string;
  lessons: SourceLesson[];
};

const driveVideo = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const driveDocument = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const driveSpreadsheet = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const stableId = (...parts: string[]) => `course-${crypto.createHash("sha256").update(parts.join("/")).digest("hex").slice(0, 32)}`;
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const foundations: SourceModule[] = [
  {
    title: "Desmos Foundations",
    description: "The essential Desmos workflows and algebra foundations used throughout the Blueprint.",
    lessons: [
      { title: "Course Walkthrough", video: "1W7-1XBbdfxIrZTvbh-DPGqfzWALCIL12" },
      { title: "Desmos Introduction", video: "1MycZZHY2Z2ODu0J1DHwAdBFiFz56I0ap" },
      { title: "One-Variable Equations", video: "16PFMFsN3G2J-d_CTbGQcB0GxGJMAPqGr" },
      { title: "Systems of Equations", video: "16XOnkjciwo1cegivMSwrzfS_c5--ft4W" },
      { title: "Number of Solutions", video: "14iJjWQcQFskL9EUZifhEqRd62sXt4ZKB" },
      { title: "Equivalent Expressions", video: "18UDnOTQZEor9i0u-tt9s4ChHJdjQjdEq" },
      { title: "Functions", video: "1e5rPOZR1oRQrTa_9JmHJBYvuWopbnU3g" },
      { title: "Inequalities", video: "1dfalCOWCJqwhI0UVCY-wBVnd7U8arops" },
      { title: "Circles", video: "1ZX-kTLzh9ataffGvgpHe_phbFlZRSzRo" },
      { title: "Regression: Part One", video: "1iK1Q5H_sJBP5LorMfgaJ-zFzCMpIPhDE" },
      { title: "Regression: Part Two", video: "1x_i1iWn2ibBDCb6v5ry1fzyXmHfEuhdV" },
      { title: "Expressions and Terms", video: "17jKqyDyps-A36LMblS4CN_nw0EJ6wy0f" },
      { title: "Factoring", video: "1n40D6iRKN50TTyCHRtgLX5uVMcSo1sgd" },
      { title: "Slope, Parallel, and Perpendicular Lines", video: "1ZJribM4j78Jjt59f6rizgLsSHoJ_8JQ-" },
      { title: "Equation Display", video: "1oUP_-5VsuZWlAnHusZm17BboyI3fr0vI" },
      { title: "Desmos Logic", video: "16xUwur2pTLmtlBfkEZDggyTQfBNHT-xH" },
    ],
  },
  {
    title: "Non-Desmos Math and Geometry",
    description: "Core quantitative skills to recognize and solve without relying on calculator shortcuts.",
    lessons: [
      { title: "Unit Conversion", video: "1gYIjvj705gsChNlmq94shHelZIUnS5ud" },
      { title: "One-Variable Data", video: "1-sJMYfz2NcjwLOXTjG566qriola1vhQk" },
      { title: "Two-Variable Data", video: "16jQpOZEKUw6rzS2jIR80dlwG-79CnU1t" },
    ],
  },
  {
    title: "Grammar Foundations",
    description: "The grammar baseline students need before moving into Reading and Writing subtopics.",
    lessons: [
      { title: "Grammar Fundamentals", video: "1cuOhfBhCNd7q4PzqqcLAxdK7IYiuhv61" },
      { title: "The Grammar Drill", video: "1Eiqn-51B6oCXxiVomdT0lXdHgkEJNQKs" },
      { title: "Practice an English Test Section", video: "140m_98KilX8-TDmJHdh2kIEL3kvGmAix" },
    ],
  },
];

const math: SourceModule[] = [
  {
    title: "Start Here",
    description: "Choose the right priorities for your score range and learn how to move through the course.",
    lessons: [
      { title: "How to Use This Course", video: "1HwJfe0VscmFHCoNMowdD5AHVk4SBD_S1" },
      { title: "Pacing on Math", video: "1QRanVLjOYQC_8R_qMGUjRn1KUQJHEoC4" },
      { title: "Priorities Below a 1000 SAT Score", video: "1ydI2R9_3J_lDsxjSx1St2TmlmdmA8UlT", notes: "1bj4VnmzwKBuDJ2PIbfxIjf7EFDlHLNRY8VC6_p-NANw" },
      { title: "Priorities for a 1000–1290 SAT Score", video: "1RYJAExoRjHf0VrwjXr33Lkh1_YwoU7_m", notes: "1L0bIAIaeqUrgKfB4Cb__TI-xKtFxp54zdQ-17R-9RGA" },
      { title: "Priorities for a 1300+ SAT Score", video: "12EvmZhR5FPDM3qxaCE3G40iez6Bmi_RN", notes: "141KFJuj3oyq3c4tdD70QtCCGyy_5ih0nCOH1L9C6Ans" },
    ],
  },
  {
    title: "Algebra",
    description: "Linear equations, functions, systems, and inequalities.",
    lessons: [
      { title: "Linear Equations in One Variable", video: "110mn8CpbSh6yncK8SsJIX2jWoobWv0k0", notes: "1zYynzU1abCBjCxRY5u3UAnhszg1PQtQUrYTi4oQWJo0" },
      { title: "Linear Functions", video: "1dWXcTLNaoRMQZWei07yALC5956cGUMj1", notes: "1oagZ--sVPdpZ18fhfmAaGRqnuW-zPL_DurMMIKuZiTE" },
      { title: "Linear Equations in Two Variables", video: "1J8KZYeI3zf_vrhk2BG65DuGjaYGgo8EK", notes: "1bx9YMnKDKvGOljQ-xtMIwW6IpfQruAufddJGYPLLEdk" },
      { title: "Systems of Two Linear Equations", video: "1zGjad_5seabC-nUMP93lJyv2EB3SzHVX", notes: "1WDkZ4AHZ9-vT3Nn1gZzHeb73sarmbMcy3zvnsyI_RVQ" },
      { title: "Linear Inequalities in One or Two Variables", video: "1uQyRbzFxMe_YOkxkVwc5oXRtMMNhdeOw", notes: "1o98x1SsNYW4vLiq1F7s-eO0Fbzt2eCNTbHzW6fyQaNs" },
    ],
  },
  {
    title: "Advanced Math",
    description: "Equivalent expressions, nonlinear equations, and nonlinear functions.",
    lessons: [
      { title: "Equivalent Expressions", video: "1TeB-pFmm_lkYWsRfEaH2Yaf8npLZ50C3", notes: "1m7OCQuQ-QJLm7Gz7U_WpZKcVwMTwzaQd_3kVmfnk3dI" },
      { title: "Nonlinear Equations and Systems", video: "1DSEM56spSi-8QQeXOSnMzGbKh_t3Bqbe", notes: "170wc4KG-5cgXM9GoEW6eEgb31zHT-6eUjIK13Kq9wi8" },
      { title: "Nonlinear Functions", video: "1ykWm6jiPiSPgOLFpeI_9tET_i5iYsVOn", notes: "1DiJUW0ba-t_kjgiWoVyEtywpEEAcTObCfQ0VS1Lic74" },
    ],
  },
  {
    title: "Problem-Solving and Data Analysis",
    description: "Rates, percentages, data, probability, inference, and statistical claims.",
    lessons: [
      { title: "Ratios, Rates, Proportional Relationships, and Units", video: "1xQf969ZulXGxgF15OdnLoQwZ7sbikbQt", notes: "1-cUP0chgO2Jpzv7wSao7mJriUlsMVcvZtoSk2U4eKVg" },
      { title: "Percentages", video: "1chSGVB4kqXEyRdPcq7tSRrqDkDXEO77m", notes: "1evPDPbGh4KjBtpIUKLGrUzTtcFnjjm1eKuY10QbqawQ" },
      { title: "One-Variable Data", video: "1AsbNkJ0OZ3uDBHeLiFTETg5cuarmBjuz", notes: "1ul8BVkGdTASRdlcveKQveH_SinZLRW6DZJkJlU6x72g" },
      { title: "Two-Variable Data", video: "13mch_pF4eJK3fHoXp2HrCSDGhhFP-ZZS", notes: "1LHagOf6s9J-4J8PV0eeUbrEvZYnhrVwgwUaSs_bRXBc" },
      { title: "Probability and Conditional Probability", video: "1_LB7YGuuYPbwmQLzS4UOCQYmp4jCK4VH", notes: "1odXlrOGTvjjkr8ET2niSq3c_KyCfDd1mHCafEKMFQBQ" },
      { title: "Inference and Margin of Error", video: "1OLim8_1SbkTc6j-HOIlBQ3ikNRvbosuT", notes: "1W3kNJA793JdmPRUBsE8l7oOxiaEN7WBzC1mRXOx425g" },
      { title: "Evaluating Statistical Claims", video: "1oCJ99KXonslyCoICOXQWuP9PQ72oXGwq", notes: "1_xmVq9NlxVuHHUvn1iytohmcnxl2N3Yatcfq2GLLQzY" },
    ],
  },
  {
    title: "Geometry and Trigonometry",
    description: "Area, volume, triangles, trigonometry, and circles.",
    lessons: [
      { title: "Area and Volume", video: "1VkAAquoO5ihUfPshJbyvJdIoRte9T8Gn", notes: "1dVkIy4kuZf5ckVc6EfTm2H7RDSPMm6DWct5Pd_FOOWY" },
      { title: "Lines, Angles, and Triangles", video: "1SOSNkDmaS6wZoa3SLtssFBSlbGqSZQp7", notes: "1XbqXmEncH5prh2UkDYFLmr_fPEJpzc01k3uu7bucMNE" },
      { title: "Right Triangles and Trigonometry", video: "1gIStzgxDKMKGk1sZvxfHygC3YpRsAo7-", notes: "1X4uMnrMI9ZkmTW0-DWyvcS6YkgoMRANcHS6O_NpxuNU" },
      { title: "Circles", video: "1qArDoYGdrKPUATS92Wiv3Bxb9fJosbB1", notes: "1eh1QCg6p45ejoHuBODb9TEBNr-Poe0rzPbMb4emfrHg" },
    ],
  },
];

const readingWriting: SourceModule[] = [
  {
    title: "Start Here",
    description: "Set your pacing, learn Scott's Read–Analyze–Predict method, and prioritize your study plan.",
    lessons: [
      { title: "Pacing and General Reading Strategies", video: "1_a7F0sUWIWSiKGXUcuDZI2-sjLwI6sdG", notes: "1qiMKJLP74b8jIxek7FlFyW6rYCxr7lndTcy4ZnmpHsE" },
      { title: "The Read–Analyze–Predict Method", video: "1OTOxKUAKqKsWQ9gNDmvacXgcN_bf7CM1", notes: "1xW5YIPVUzpTg4kUkwsn0IOURg3Pf7uSJXcayii7-rj8" },
      { title: "Priorities Below a 500 Reading and Writing Score", notes: "1P2CvoJvyZb59H2bFNmoUMr5wkOfnmkSVa0VoFypyoHk" },
    ],
  },
  {
    title: "Craft and Structure",
    description: "Words in context, text structure and purpose, and cross-text connections.",
    lessons: [
      { title: "Words in Context", video: "1iG8mhVLbd89v-YQeJB54MgOzQoAmXTo2", notes: "1n4SUIyAuZJKcfJuMkoX2TDhqOUvSRWWr0P24v1FzKXI", resources: [{ title: "Word Parts Reference", id: "1E9yffKgi2PKQ0cMYnS4Va2Zpw0cW5hGg7MDPxF2rvn0", kind: "spreadsheet" }] },
      { title: "Text Structure and Purpose", video: "1z73bj6gglDWXrjNvA2hj1jey2QjpzyXi", notes: "1lQ-mE7RLsuig3GVw3kX8-DzWOsy4s6sh9zBAJH1NJrQ" },
      { title: "Cross-Text Connections", video: "17Ev2w7omYCiSDZZm4tQ92ojFSIxGjiXa", notes: "1AAeft63HqtRrbIYaO6lBDWZy2aSj0_x2kJuCtrouEMw" },
    ],
  },
  {
    title: "Information and Ideas",
    description: "Central ideas, evidence, and inference questions.",
    lessons: [
      { title: "Central Ideas and Details", video: "1pVGImrIvjwNwPu6y4cDy6AK9WVBhMfgR", notes: "1xX0Jac-8vVDOtUHcfytQCrB4EWYyo-hkR3MddFRVxyI" },
      { title: "Command of Evidence", video: "1hSMwAvixZ6SERBZN36PU8NMrMrSPMJYr", notes: "12_gbIM0bnUuEkysW2TGvFNbrg7Vwn6cGl6FJtYuEFCA" },
      { title: "Inferences", video: "1iFWY9-Rs0mCQ3JraV1Tzc8zQD-2KXpE_", notes: "1PLL-QZOmmmeqg7joIWVsUx1ASgS7C0Q4VLwh-wD9cKw" },
    ],
  },
  {
    title: "Expression of Ideas",
    description: "Rhetorical synthesis and transitions.",
    lessons: [
      { title: "Rhetorical Synthesis", video: "1WXkQR3NHTtcr5vKSwwk1fM6mBmNunAhP", notes: "1xIIWQuzLMSD3jrTJhHG6zJXKVSumJVjo8HVyffTRPTc" },
      { title: "Transitions", video: "1RYojVhA07LJ8ENE_gMfwveN2zvwTYTHG", notes: "1rFnXicK4V4SYNat6AYr5km76Z-6XHzaH9xFQc_LiFLc" },
    ],
  },
  {
    title: "Standard English Conventions",
    description: "Sentence boundaries, form, structure, and sense.",
    lessons: [
      { title: "Boundaries", video: "1p4yc1xtg_b3lR3nM1elKqNOaDJB0yFhy", notes: "1uSCn7LzddC1-DnCzy7j4MfRRb2SX6CHkZiy4qBd19uY" },
      { title: "Form, Structure, and Sense", video: "1G9yV5zXFvEjtgRpI05iBiatCr467wdMS", notes: "1hfsjPPuv2goRcyfyd8fU9z2SNtIiKkcsZEZOOwzLqjw" },
    ],
  },
];

function lessonBlocks(lesson: SourceLesson): LessonBlock[] {
  const blocks: Omit<LessonBlock, "id" | "position">[] = [];
  if (lesson.video) blocks.push({ kind: "video", content: { url: driveVideo(lesson.video), title: lesson.title } });
  if (lesson.notes) blocks.push({ kind: "file", content: { url: driveDocument(lesson.notes), title: `${lesson.title} — Guided Notes`, description: "Follow along with Scott's original visual notes." } });
  for (const resource of lesson.resources ?? []) {
    const url = resource.kind === "spreadsheet" ? driveSpreadsheet(resource.id) : driveDocument(resource.id);
    blocks.push({ kind: "file", content: { url, title: resource.title, description: "Course reference resource." } });
  }
  return blocks.map((block, index) => ({ ...block, id: stableId(lesson.title, block.kind, String(index + 1)), position: index + 1 }));
}

function course(slug: string, title: string, description: string, eyebrow: string, position: number, source: SourceModule[]): CourseInput {
  const modules: CourseModule[] = source.map((module, moduleIndex) => ({
    id: stableId(slug, module.title),
    slug: slugify(module.title),
    title: module.title,
    description: module.description,
    position: moduleIndex + 1,
    status: "published",
    lessons: module.lessons.map((lesson, lessonIndex) => {
      const blocks = lessonBlocks(lesson).map((block) => ({ ...block, id: stableId(slug, module.title, lesson.title, block.kind, String(block.position)) }));
      return {
        id: stableId(slug, module.title, lesson.title),
        slug: slugify(lesson.title),
        title: lesson.title,
        summary: lesson.video && lesson.notes ? "Video lesson with Scott's guided notes." : lesson.video ? "Video lesson." : "Scott's guided notes.",
        position: lessonIndex + 1,
        estimatedMinutes: lesson.video ? 15 : 8,
        status: "published" as const,
        completed: false,
        blocks,
      };
    }),
  }));
  const estimatedMinutes = modules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.estimatedMinutes, 0);
  return { id: stableId(slug), slug, title, description, eyebrow, coverUrl: null, position, estimatedMinutes, status: "published", modules };
}

const courses = [
  course("blueprint-foundations", "Blueprint Foundations", "Build the Desmos, math, data, and grammar foundation used throughout the 1500 SAT Blueprint.", "Start with the system", 1, foundations),
  course("math-subtopic-course", "Math Subtopic Course", "Master every Digital SAT math domain with Scott's strategy videos and guided notes.", "Math curriculum", 2, math),
  course("reading-writing-subtopic-course", "Reading and Writing Subtopic Course", "Learn Scott's Reading and Writing process across every tested Digital SAT domain.", "Reading and Writing curriculum", 3, readingWriting),
];

async function main() {
  const write = process.argv.includes("--write");
  const modules = courses.flatMap((item) => item.modules);
  const lessons = modules.flatMap((module) => module.lessons);
  const blocks = lessons.flatMap((lesson) => lesson.blocks);
  const driveIds = blocks.map((block) => block.content.url).filter((url): url is string => Boolean(url));
  if (new Set(driveIds).size !== driveIds.length) throw new Error("Duplicate Drive resource found in the course map.");
  console.log(`Courses: ${courses.length}\nModules: ${modules.length}\nLessons: ${lessons.length}\nBlocks: ${blocks.length}`);
  for (const item of courses) console.log(`- ${item.title}: ${item.modules.length} modules, ${item.modules.flatMap((module) => module.lessons).length} lessons`);
  if (!write) { console.log("Audit only. Add --write to import."); return; }
  for (const item of courses) {
    if (!(await saveCourse(item))) throw new Error(`Failed to import ${item.slug}`);
    console.log(`Imported ${item.slug}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
