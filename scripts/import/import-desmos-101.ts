/**
 * Import the Desmos 101 source course into Ultimate.
 *
 * The source names nine quizzes, but their questions were not supplied. They
 * are intentionally omitted from the student course and listed in QUIZ_HANDOFF
 * for an admin to add later in the course editor.
 *
 * npx tsx --env-file=.env.local scripts/import/import-desmos-101.ts
 * npx tsx --env-file=.env.local scripts/import/import-desmos-101.ts --write
 * npx tsx --env-file=.env.local scripts/import/import-desmos-101.ts --write --update
 */
import * as crypto from "node:crypto";
import { auditCourse } from "../../lib/courses/audit";
import type { Course, CourseInput, CourseLesson, CourseModule, LessonBlock } from "../../lib/courses/types";
import { supabaseAdmin } from "../../utils/supabase/admin";

type VimeoAsset = {
  id: string;
  hash: string;
  name: string;
  durationSeconds: number;
};

type BlockDraft = Omit<LessonBlock, "id" | "position">;

type LessonDraft = {
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  blocks: BlockDraft[];
};

type ModuleDraft = {
  slug: string;
  title: string;
  description: string;
  lessons: LessonDraft[];
};

const COURSE_SLUG = "desmos-101";
const COURSE_POSITION = 2;
const CANONICAL_EMBED_DOMAIN = "www.1500satblueprint.com";

const MASTER_GUIDE_URL = "https://api.drived.space/uploads/drived/416/download/pdf/zy/e3/f0f0o4p4.pdf";
const FORMULA_SHEET_URL = "https://api.drived.space/uploads/drived/416/download/pdf/di/3o/vnvnvjhi.pdf";

const VIMEO = {
  overview: { id: "1200857499", hash: "77cd049d0e", name: "Desmos Intro (foundations)", durationSeconds: 703 },
  oneVariableEquations: { id: "1201040153", hash: "5b3392c11c", name: "One variable equations (foundations)", durationSeconds: 363 },
  systemsOfEquations: { id: "1201042860", hash: "eb67030cfd", name: "systems of equations (foundations)", durationSeconds: 198 },
  numberOfSolutions: { id: "1201202302", hash: "5fe5baab80", name: "# of solutions (foundations", durationSeconds: 563 },
  equivalentExpressions: { id: "1201251611", hash: "cff0595ea2", name: "equivalent expressions (foundations)", durationSeconds: 636 },
  functions: { id: "1201483683", hash: "8bf91744b6", name: "functions (foundations)", durationSeconds: 271 },
  inequalities: { id: "1201489485", hash: "5c84a47310", name: "inequalities (foundations)", durationSeconds: 365 },
  circles: { id: "1201497903", hash: "925368eec3", name: "circles (foundations)", durationSeconds: 530 },
  regressionPart1: { id: "1201890583", hash: "005b266b0e", name: "Regression Part One (foundations)", durationSeconds: 1848 },
  regressionPart2: { id: "1202203435", hash: "6e686208a5", name: "Regression PArt 2 (foundations", durationSeconds: 1608 },
  expressionOfTerms: { id: "1202242921", hash: "c68bde00b6", name: "expression of terms (foundations)", durationSeconds: 258 },
  factoring: { id: "1202247486", hash: "3eba258a83", name: "factoring (foundations)", durationSeconds: 463 },
  invitation: { id: "1178184064", hash: "e6390ef50e", name: "Final VSL (1)", durationSeconds: 70 },
} satisfies Record<string, VimeoAsset>;

export const QUIZ_HANDOFF = [
  { lesson: "Step 1", title: "Step 1 Quiz" },
  { lesson: "Step 2", title: "Equivalent Expressions Quiz" },
  { lesson: "Step 2", title: "Functions Quiz" },
  { lesson: "Step 3", title: "Circles Quiz" },
  { lesson: "Step 3", title: "Inequalities Quiz" },
  { lesson: "Step 4", title: "Regression Quiz Part 1" },
  { lesson: "Step 4", title: "Regression Quiz Part 2" },
  { lesson: "Step 5", title: "Expression of Terms Quiz" },
  { lesson: "Step 6", title: "Factoring Quiz" },
] as const;

const stableId = (...parts: string[]) => `course-${crypto.createHash("sha256").update(parts.join("/")).digest("hex").slice(0, 32)}`;
const vimeoUrl = (asset: VimeoAsset) => `https://player.vimeo.com/video/${asset.id}?h=${asset.hash}`;

function text(title: string, body: string): BlockDraft {
  return { kind: "text", content: { title, body } };
}

function video(title: string, asset: VimeoAsset, description = "Watch the full lesson and take notes on the workflow Scott demonstrates."): BlockDraft {
  return { kind: "video", content: { title, url: vimeoUrl(asset), description } };
}

function resource(title: string, url: string, description: string, actionLabel: string): BlockDraft {
  return { kind: "file", content: { title, url, description, actionLabel, display: "card" } };
}

function freePdfResources(): BlockDraft[] {
  return [
    resource("SAT Math Desmos Master Guide", MASTER_GUIDE_URL, "Scott Robinson's free Desmos reference guide for Digital SAT Math.", "Open free PDF"),
    resource("Math Formula Cheat Sheet", FORMULA_SHEET_URL, "Scott Robinson's free formula sheet from The 7-Day SAT Crash Course.", "Open free PDF"),
  ];
}

const modules: ModuleDraft[] = [
  {
    slug: "start-here",
    title: "Start Here",
    description: "Save the course resources, learn the Desmos workflow, and prepare to work through the six-step plan.",
    lessons: [
      {
        slug: "introduction-to-the-course",
        title: "Introduction to the Course",
        summary: "Save both free reference PDFs, then begin with the Desmos 101 overview.",
        estimatedMinutes: 5,
        blocks: [
          text("How to use Desmos 101", "Start with the overview, keep both free PDFs nearby, and take your own notes as you complete each step."),
          resource("Desmos 101 Overview", `/ultimate/courses/${COURSE_SLUG}/desmos-101-overview`, "Watch the course overview before beginning Step 1.", "Start the overview"),
          ...freePdfResources(),
          resource("The 1500 Blueprint", "/pricing", "If you want the complete system, weekly accountability, and the full curriculum, compare the Blueprint plans.", "View Blueprint plans"),
        ],
      },
      {
        slug: "desmos-101-overview",
        title: "Desmos 101 Overview",
        summary: "Learn what Desmos can do on the Digital SAT and how to use this course.",
        estimatedMinutes: 15,
        blocks: [
          video("Desmos 101 Overview", VIMEO.overview, "This is the exact 11:43 Desmos introduction from the source course."),
          text("Take notes as you watch", "Write down the tools and patterns you expect to use again. Keep the Master Guide open as a reference."),
          ...freePdfResources(),
        ],
      },
    ],
  },
  {
    slug: "six-step-plan",
    title: "The Six-Step Plan",
    description: "Work through the source course in order, take notes on every video, and complete each linked mastery assignment.",
    lessons: [
      {
        slug: "step-1",
        title: "Step 1",
        summary: "Master one-variable equations, systems of equations, and the number of solutions.",
        estimatedMinutes: 30,
        blocks: [
          text("Step 1 checklist", "Watch all three lessons, take notes on each one, then finish Days 1 & 2 of Blueprint Foundation."),
          video("One-Variable Equations", VIMEO.oneVariableEquations),
          video("Systems of Equations", VIMEO.systemsOfEquations),
          video("Number of Solutions", VIMEO.numberOfSolutions),
          resource("Blueprint Foundation: Days 1 & 2", "/ultimate/courses/blueprint-foundations/days-1-2", "Continue with the matching Foundations lessons and focused practice.", "Open Days 1 & 2"),
          ...freePdfResources(),
        ],
      },
      {
        slug: "step-2",
        title: "Step 2",
        summary: "Use Desmos to recognize equivalent expressions and work with functions.",
        estimatedMinutes: 25,
        blocks: [
          text("Step 2 checklist", "Watch Equivalent Expressions and Functions, take notes, then complete the matching mastery work in Blueprint Foundation."),
          video("Equivalent Expressions", VIMEO.equivalentExpressions),
          video("Functions", VIMEO.functions),
          resource("Functions Mastery Video + Practice", "/ultimate/courses/blueprint-foundations/days-3-4", "Open the Foundations lesson containing functions instruction and focused practice.", "Open functions mastery"),
          ...freePdfResources(),
        ],
      },
      {
        slug: "step-3",
        title: "Step 3",
        summary: "Apply Desmos to circles and inequalities, then continue into mastery practice.",
        estimatedMinutes: 25,
        blocks: [
          text("Step 3 checklist", "Watch Circles and Inequalities, take notes, and complete the practice below the matching mastery lessons."),
          video("Circles", VIMEO.circles),
          video("Inequalities", VIMEO.inequalities),
          resource("Circles Mastery Video + Practice", "/ultimate/courses/blueprint-foundations/days-3-4", "Return to the Foundations lesson for the circles and inequalities mastery work.", "Open circles mastery"),
          resource("Algebra Mastery Module", "/ultimate/courses/math-subtopic-course", "Continue into the complete Math Subtopic Course. This advanced course is included with Max.", "Open Algebra mastery"),
          ...freePdfResources(),
        ],
      },
      {
        slug: "step-4",
        title: "Step 4",
        summary: "Learn both regression workflows and take notes on every step.",
        estimatedMinutes: 65,
        blocks: [
          text("Take notes on both regression lessons", "Watch Regression Parts 1 and 2 in full. Record the setup, model choice, and interpretation steps before moving into Advanced Math mastery."),
          video("Regression Part 1", VIMEO.regressionPart1),
          video("Regression Part 2", VIMEO.regressionPart2),
          resource("Advanced Math Mastery Module", "/ultimate/courses/math-subtopic-course", "Use the complete Math Subtopic Course to finish the Advanced Math mastery work. This advanced course is included with Max.", "Open Advanced Math mastery"),
          ...freePdfResources(),
        ],
      },
      {
        slug: "step-5",
        title: "Step 5",
        summary: "Learn expression of terms, then complete Scott's Practice Test 2.",
        estimatedMinutes: 140,
        blocks: [
          text("Step 5 checklist", "Watch Expression of Terms, take notes, then open the test library and choose Practice Test 2. Set aside about 2 hours and 14 minutes for the test."),
          video("Expression of Terms", VIMEO.expressionOfTerms),
          resource("Scott's Practice Test 2", "/ultimate/tests", "Choose Practice Test 2 from the test library. If it is not included in your current plan, the library will show the correct upgrade path.", "Open the test library"),
          ...freePdfResources(),
        ],
      },
      {
        slug: "step-6",
        title: "Step 6",
        summary: "Finish with factoring and bring your remaining questions to the next group session.",
        estimatedMinutes: 20,
        blocks: [
          text("Step 6 checklist", "Watch Factoring, take notes, then attend the next live group session or watch the available recording."),
          video("Factoring", VIMEO.factoring),
          resource("Next Group Session", "/ultimate/live-calls", "See the upcoming Blueprint group session and available call resources. Live classes are included with Max.", "View live calls"),
          ...freePdfResources(),
        ],
      },
    ],
  },
  {
    slug: "finish-and-next-steps",
    title: "Finish and Next Steps",
    description: "Review what you learned, then decide how you want to continue with the Blueprint system.",
    lessons: [
      {
        slug: "summary",
        title: "Summary",
        summary: "Review the Desmos tools you now know and the SAT patterns you still need to practice.",
        estimatedMinutes: 5,
        blocks: [
          text("You completed Desmos 101", "You now know the core Desmos tools that top SAT scorers use. Tools alone do not produce a 1400 or 1500: the next step is learning when to use them, recognizing the patterns that repeat on every SAT, and practicing with consistent accountability."),
          resource("Review Blueprint Foundation", "/ultimate/courses/blueprint-foundations", "Revisit the full Foundations sequence before moving into advanced subtopic work.", "Open Blueprint Foundation"),
        ],
      },
      {
        slug: "invitation",
        title: "Invitation",
        summary: "See how the complete 1500 Blueprint combines curriculum, practice, and weekly support.",
        estimatedMinutes: 5,
        blocks: [
          video("The 1500 Blueprint Invitation", VIMEO.invitation, "This is the exact 1:10 invitation video shown in the source course."),
          text("Put the full system together", "When you join, complete Blueprint Foundation first—especially if you are below 1400—and attend the weekly classes so you can correct mistakes quickly."),
          resource("Enroll in The 1500 Blueprint", "/pricing", "Compare Core and Max, then choose the level of curriculum, practice, and support you need.", "View plans and enroll"),
          resource("Blueprint Foundation", "/ultimate/courses/blueprint-foundations", "Start with Foundations before the advanced courses.", "Open Foundation"),
          resource("Weekly Classes", "/ultimate/live-calls", "See the live class schedule and recordings available with Max.", "View weekly classes"),
        ],
      },
    ],
  },
];

function buildCourse(): CourseInput {
  const courseModules: CourseModule[] = modules.map((module, moduleIndex) => ({
    id: stableId(COURSE_SLUG, module.slug),
    slug: module.slug,
    title: module.title,
    description: module.description,
    position: moduleIndex + 1,
    status: "published",
    lessons: module.lessons.map((lesson, lessonIndex): CourseLesson => ({
      id: stableId(COURSE_SLUG, module.slug, lesson.slug),
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      position: lessonIndex + 1,
      estimatedMinutes: lesson.estimatedMinutes,
      status: "published",
      completed: false,
      blocks: lesson.blocks.map((block, blockIndex) => ({
        ...block,
        id: stableId(COURSE_SLUG, module.slug, lesson.slug, String(blockIndex + 1)),
        position: blockIndex + 1,
      })),
    })),
  }));
  const estimatedMinutes = courseModules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.estimatedMinutes, 0);
  return {
    id: stableId(COURSE_SLUG),
    slug: COURSE_SLUG,
    title: "Desmos 101",
    description: "Learn Scott Robinson's essential Digital SAT Desmos workflows in six steps, with the original videos and both free reference PDFs.",
    eyebrow: "Free Desmos course",
    coverUrl: null,
    coverZoom: 1,
    position: COURSE_POSITION,
    estimatedMinutes,
    status: "published",
    modules: courseModules,
  };
}

function validateCourse(course: CourseInput): void {
  const lessonCount = course.modules.flatMap((module) => module.lessons).length;
  const hydrated: Course = { ...course, completedLessons: 0, totalLessons: lessonCount, progress: 0 };
  const audit = auditCourse(hydrated);
  if (lessonCount !== 10) throw new Error(`Expected 10 source chapters, found ${lessonCount}.`);
  if (audit.issues.length > 0) throw new Error(`Course audit failed:\n${audit.issues.map((issue) => `- ${issue.title}: ${issue.detail}`).join("\n")}`);
  const blocks = course.modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.blocks);
  if (blocks.some((block) => block.kind === "practice")) {
    throw new Error("Quiz or practice blocks must remain absent until an admin supplies the questions.");
  }
}

async function verifyExternalAssets(): Promise<void> {
  const token = process.env.VIMEO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("VIMEO_ACCESS_TOKEN is required to verify the source videos.");
  for (const asset of Object.values(VIMEO)) {
    const [videoResponse, domainsResponse, embedResponse] = await Promise.all([
      fetch(`https://api.vimeo.com/videos/${asset.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://api.vimeo.com/videos/${asset.id}/privacy/domains?per_page=100`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(vimeoUrl(asset))}`, {
        headers: { Referer: `https://${CANONICAL_EMBED_DOMAIN}/ultimate/courses/${COURSE_SLUG}` },
      }),
    ]);
    if (!videoResponse.ok) throw new Error(`Vimeo ${asset.id} returned ${videoResponse.status}.`);
    if (!domainsResponse.ok) throw new Error(`Vimeo domain check ${asset.id} returned ${domainsResponse.status}.`);
    if (!embedResponse.ok) throw new Error(`Vimeo embed check ${asset.id} returned ${embedResponse.status}.`);
    const videoData = await videoResponse.json() as { name?: string; duration?: number; player_embed_url?: string };
    const domainsData = await domainsResponse.json() as { data?: { domain?: string }[] };
    const embedData = await embedResponse.json() as { title?: string };
    if (videoData.name !== asset.name || videoData.duration !== asset.durationSeconds) {
      throw new Error(`Vimeo ${asset.id} no longer matches ${asset.name} (${asset.durationSeconds}s).`);
    }
    if (!videoData.player_embed_url?.includes(asset.hash)) throw new Error(`Vimeo ${asset.id} embed hash does not match.`);
    const allowedDomains = (domainsData.data ?? []).flatMap((item) => item.domain ? [item.domain] : []);
    const domainAllowed = allowedDomains.some((domain) => CANONICAL_EMBED_DOMAIN === domain || CANONICAL_EMBED_DOMAIN.endsWith(`.${domain}`));
    if (!domainAllowed || embedData.title !== asset.name) {
      throw new Error(`Vimeo ${asset.id} does not allow ${CANONICAL_EMBED_DOMAIN}.`);
    }
  }

  for (const url of [MASTER_GUIDE_URL, FORMULA_SHEET_URL]) {
    const response = await fetch(url);
    if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
      throw new Error(`Free PDF failed verification: ${url}`);
    }
    await response.body?.cancel();
  }
}

async function verifyInternalTargets(): Promise<void> {
  const db = supabaseAdmin();
  const [foundation, mathCourse, practiceTest] = await Promise.all([
    db.from("courses").select("id,status").eq("slug", "blueprint-foundations").eq("status", "published").maybeSingle<{ id: string; status: string }>(),
    db.from("courses").select("id,status").eq("slug", "math-subtopic-course").eq("status", "published").maybeSingle<{ id: string; status: string }>(),
    db.from("tests").select("slug,status").eq("slug", "practice-test-2").eq("status", "published").maybeSingle<{ slug: string; status: string }>(),
  ]);
  for (const result of [foundation, mathCourse, practiceTest]) {
    if (result.error) throw result.error;
  }
  if (!foundation.data) throw new Error("Published Blueprint Foundation course was not found.");
  if (!mathCourse.data) throw new Error("Published Math Subtopic Course was not found.");
  if (!practiceTest.data) throw new Error("Published Practice Test 2 was not found.");

  const courseModules = await db.from("course_modules").select("id").eq("course_id", foundation.data.id).returns<{ id: string }[]>();
  if (courseModules.error) throw courseModules.error;
  const moduleIds = (courseModules.data ?? []).map((module) => module.id);
  const lessons = await db.from("course_lessons").select("slug,status").in("module_id", moduleIds).in("slug", ["days-1-2", "days-3-4"]).eq("status", "published").returns<{ slug: string; status: string }[]>();
  if (lessons.error) throw lessons.error;
  const lessonSlugs = new Set((lessons.data ?? []).map((lesson) => lesson.slug));
  for (const slug of ["days-1-2", "days-3-4"]) {
    if (!lessonSlugs.has(slug)) throw new Error(`Published Blueprint Foundation lesson ${slug} was not found.`);
  }
}

async function makeRoomForCourse(): Promise<void> {
  const db = supabaseAdmin();
  const result = await db.from("courses").select("id,slug,position").gte("position", COURSE_POSITION).order("position", { ascending: false }).returns<{ id: string; slug: string; position: number }[]>();
  if (result.error) throw result.error;
  for (const existing of result.data ?? []) {
    if (existing.slug === COURSE_SLUG) continue;
    const update = await db.from("courses").update({ position: existing.position + 1 }).eq("id", existing.id);
    if (update.error) throw update.error;
  }
}

async function upsertCourseWithoutDeleting(course: CourseInput): Promise<void> {
  const db = supabaseAdmin();
  const courseResult = await db.from("courses").upsert({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    eyebrow: course.eyebrow,
    cover_url: course.coverUrl,
    cover_zoom: course.coverZoom,
    position: course.position,
    estimated_minutes: course.estimatedMinutes,
    status: course.status,
    updated_at: new Date().toISOString(),
  });
  if (courseResult.error) throw courseResult.error;

  for (const courseModule of course.modules) {
    const moduleResult = await db.from("course_modules").upsert({
      id: courseModule.id,
      course_id: course.id,
      slug: courseModule.slug,
      title: courseModule.title,
      description: courseModule.description,
      position: courseModule.position,
      status: courseModule.status,
    });
    if (moduleResult.error) throw moduleResult.error;
    for (const lesson of courseModule.lessons) {
      const lessonResult = await db.from("course_lessons").upsert({
        id: lesson.id,
        module_id: courseModule.id,
        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        position: lesson.position,
        estimated_minutes: lesson.estimatedMinutes,
        status: lesson.status,
      });
      if (lessonResult.error) throw lessonResult.error;
      if (lesson.blocks.length === 0) continue;
      const blockResult = await db.from("course_lesson_blocks").upsert(lesson.blocks.map((block) => ({
        id: block.id,
        lesson_id: lesson.id,
        position: block.position,
        kind: block.kind,
        content: block.content,
      })));
      if (blockResult.error) throw blockResult.error;
    }
  }
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const update = process.argv.includes("--update");
  const course = buildCourse();
  validateCourse(course);
  await Promise.all([verifyExternalAssets(), verifyInternalTargets()]);

  const lessons = course.modules.flatMap((module) => module.lessons);
  const blocks = lessons.flatMap((lesson) => lesson.blocks);
  console.log(`Course: ${course.title}\nModules: ${course.modules.length}\nChapters: ${lessons.length}\nBlocks: ${blocks.length}\nVideos: ${Object.keys(VIMEO).length}\nQuiz handoff: ${QUIZ_HANDOFF.length}`);
  for (const item of QUIZ_HANDOFF) console.log(`- Admin TODO: ${item.lesson} — ${item.title}`);
  if (!write) {
    console.log("Audit only. Add --write to import.");
    return;
  }

  const db = supabaseAdmin();
  const existing = await db.from("courses").select("id").eq("slug", COURSE_SLUG).maybeSingle<{ id: string }>();
  if (existing.error) throw existing.error;
  if (existing.data && !update) throw new Error("Desmos 101 already exists. Use --update to refresh source blocks without deleting admin-authored quizzes.");
  if (!existing.data) await makeRoomForCourse();
  await upsertCourseWithoutDeleting(course);
  console.log(`Imported ${COURSE_SLUG}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
