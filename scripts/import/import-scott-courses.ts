/**
 * Import Scott's three approved curricula into the Ultimate course system.
 * Blueprint Foundations videos use Scott's private Vimeo embeds. Guided notes,
 * diagrams, and other source files remain in Drive to preserve their fidelity.
 *
 * npx tsx --env-file=.env.local scripts/import/import-scott-courses.ts
 * npx tsx --env-file=.env.local scripts/import/import-scott-courses.ts --write
 */
import * as crypto from "node:crypto";
import { saveCourse } from "../../lib/courses/queries";
import type { CourseInput, CourseModule, LessonBlock } from "../../lib/courses/types";

type SourceLesson = {
  key?: string;
  title: string;
  intro?: string;
  video?: string;
  videoMissing?: boolean;
  notes?: string;
  resources?: {
    title: string;
    description: string;
    id?: string;
    url?: string;
    kind?: "document" | "spreadsheet";
    actionLabel?: string;
  }[];
  practiceSkills?: string[];
};

type SourceModule = {
  title: string;
  description: string;
  lessons: SourceLesson[];
};

type FoundationResource = {
  title: string;
  description: string;
  document: string;
};

type FoundationStep = {
  title: string;
  description?: string;
  video?: string;
  href?: string;
  actionLabel?: string;
  eyebrow?: string;
  unavailable?: boolean;
};

type FoundationDay = {
  title: string;
  summary: string;
  estimatedMinutes: number;
  intro?: string;
  resources?: FoundationResource[];
  steps: FoundationStep[];
  submission?: string;
};

type FoundationWeek = {
  title: string;
  description: string;
  days: FoundationDay[];
};

const driveVideo = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const vimeoVideo = (id: string, hash: string) => `https://player.vimeo.com/video/${id}?h=${hash}`;
const driveDocument = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const driveSpreadsheet = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const stableId = (...parts: string[]) => `course-${crypto.createHash("sha256").update(parts.join("/")).digest("hex").slice(0, 32)}`;
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const mathPractice = (...skills: string[]) => `/ultimate/bank/math/practice?skills=${encodeURIComponent(skills.join("|"))}`;
const readingPractice = (...skills: string[]) => `/ultimate/bank/reading-writing/practice?skills=${encodeURIComponent(skills.join("|"))}`;

const foundationWeeks: FoundationWeek[] = [
  {
    title: "Desmos Foundations (Week 1)",
    description: "Build the Desmos workflows that unlock the fastest SAT Math points, then prove mastery through focused practice.",
    days: [
      {
        title: "Days 1 & 2",
        summary: "Set up the Blueprint system and master equations, systems, and solution counts in Desmos.",
        estimatedMinutes: 110,
        intro: "Take your own notes while you work. Scott's two original PDF packets—SAT Math Desmos Master Guide and Math Formula Cheat Sheet—were named in the source course but were not included in the shared Drive, so no substitute download has been fabricated.",
        steps: [
          { title: "Watch the Course Walkthrough", video: vimeoVideo("1201244309", "94e9d47dbc"), eyebrow: "Watch" },
          { title: "Watch the Desmos Introduction", video: vimeoVideo("1200857499", "77cd049d0e"), eyebrow: "Watch" },
          { title: "Complete the Desmos Intro practice", description: "Repeat the original practice until you reach 100%.", eyebrow: "Practice", unavailable: true },
          { title: "Watch One-Variable Equations", video: vimeoVideo("1201040153", "5b3392c11c"), eyebrow: "Watch" },
          { title: "Watch Systems of Equations", video: vimeoVideo("1201042860", "eb67030cfd"), eyebrow: "Watch" },
          { title: "Watch Amount of Solutions", video: vimeoVideo("1201202302", "5fe5baab80"), eyebrow: "Watch" },
          { title: "Complete Solutions & Systems practice", description: "Practice the imported equation and systems questions until your process is reliable.", href: mathPractice("Linear equations in one variable", "Linear equations in two variables", "Systems of two linear equations in two variables"), actionLabel: "Start focused practice", eyebrow: "Practice" },
        ],
        submission: "Post your notes and both practice completion screenshots in Community. Title the post “Days 1 & 2 Done!”",
      },
      {
        title: "Days 3 & 4",
        summary: "Use Desmos for expressions, functions, inequalities, circles, and regression.",
        estimatedMinutes: 140,
        steps: [
          { title: "Watch Equivalent Expressions", video: vimeoVideo("1201251611", "cff0595ea2"), eyebrow: "Watch" },
          { title: "Complete Equivalent Expressions practice", description: "Continue until you reach 100%, then save the completion page.", href: mathPractice("Equivalent expressions"), actionLabel: "Practice equivalent expressions", eyebrow: "Practice" },
          { title: "Watch Functions", video: vimeoVideo("1201483683", "8bf91744b6"), eyebrow: "Watch" },
          { title: "Complete Functions practice", description: "Work both linear and nonlinear function questions until you reach 100%.", href: mathPractice("Linear functions", "Nonlinear functions"), actionLabel: "Practice functions", eyebrow: "Practice" },
          { title: "Watch Inequalities", video: vimeoVideo("1201489485", "5c84a47310"), eyebrow: "Watch" },
          { title: "Complete Inequalities practice", description: "Continue until you reach 100%, then save the completion page.", href: mathPractice("Linear inequalities in one or two variables"), actionLabel: "Practice inequalities", eyebrow: "Practice" },
          { title: "Watch Circles", video: vimeoVideo("1201497903", "925368eec3"), eyebrow: "Watch" },
          { title: "Complete Circles practice", description: "Continue until you reach 100%, then save the completion page.", href: mathPractice("Circles"), actionLabel: "Practice circles", eyebrow: "Practice" },
          { title: "Watch Regression Basics #1", video: vimeoVideo("1201890583", "005b266b0e"), eyebrow: "Watch" },
          { title: "Complete Regression #1 practice", description: "Use Scott's two-variable data questions and continue until you reach 100%.", href: mathPractice("Two-variable data: models and scatterplots"), actionLabel: "Practice regression", eyebrow: "Practice" },
        ],
        submission: "Post every completion screenshot and a picture of your notes in Community. Title the post “Days 3 & 4 Done!”",
      },
      {
        title: "Days 5 & 6",
        summary: "Finish Scott's advanced Desmos workflows and connect them to targeted SAT practice.",
        estimatedMinutes: 125,
        intro: "This day group was visible in Scott's original course but omitted from the pasted outline. The sequence below uses the six remaining verified videos from Scott's Vimeo Foundations library and the corresponding Blueprint practice topics.",
        steps: [
          { title: "Watch Regression Basics #2", video: vimeoVideo("1202203435", "6e686208a5"), eyebrow: "Watch" },
          { title: "Complete Regression #2 practice", description: "Apply the second regression workflow to imported two-variable data questions.", href: mathPractice("Two-variable data: models and scatterplots"), actionLabel: "Practice regression", eyebrow: "Practice" },
          { title: "Watch Expressions and Terms", video: vimeoVideo("1202242921", "c68bde00b6"), eyebrow: "Watch" },
          { title: "Complete Expressions and Terms practice", href: mathPractice("Equivalent expressions"), actionLabel: "Practice expressions", eyebrow: "Practice" },
          { title: "Watch Factoring", video: vimeoVideo("1202247486", "3eba258a83"), eyebrow: "Watch" },
          { title: "Complete Factoring practice", href: mathPractice("Equivalent expressions", "Nonlinear equations in one variable and systems of equations in two variables"), actionLabel: "Practice factoring", eyebrow: "Practice" },
          { title: "Watch Slope, Parallel, and Perpendicular Lines", video: vimeoVideo("1202258206", "7f1ae31436"), eyebrow: "Watch" },
          { title: "Watch Equation Display", video: vimeoVideo("1202266675", "23a9ead5ae"), eyebrow: "Watch" },
          { title: "Watch Desmos Logic", video: vimeoVideo("1202301620", "03f4cd1dcf"), eyebrow: "Watch" },
        ],
        submission: "Save your practice completion pages and notes, then post them in Community as “Days 5 & 6 Done!”",
      },
      {
        title: "Day 7",
        summary: "Memorize the Desmos patterns and prove mastery before moving to Grammar Foundations.",
        estimatedMinutes: 75,
        steps: [
          { title: "Memorize the Graphing Flashcards", description: "Take notes—Scott marks this as essential.", eyebrow: "Flashcards", unavailable: true },
          { title: "Memorize the Regression Flashcards", description: "Take notes and be able to reproduce each pattern without help.", eyebrow: "Flashcards", unavailable: true },
          { title: "Take the Desmos Mastery Quiz", description: "Screenshot the completion page. If you miss anything, review the matching lesson and retake the quiz.", eyebrow: "Mastery quiz", unavailable: true },
        ],
        submission: "Post your quiz screenshot and notes in Community as “Day 7 Done!” If you are below 100%, review the exact missed topic before continuing to Week 2.",
      },
    ],
  },
  {
    title: "Grammar Foundations (Week 2)",
    description: "Master punctuation, boundaries, transitions, modifiers, agreement, and the grammar patterns that produce reliable Reading and Writing points.",
    days: [
      {
        title: "Days 8 & 9",
        summary: "Build the punctuation process and drill independent clauses until it is automatic.",
        estimatedMinutes: 105,
        intro: "Scott's original Master Grammar Guide PDF was not included in the shared Drive. The verified Boundaries guided notes from his Reading and Writing course are attached instead. Some videos overlap with the R&W Playbook, but these drills and mastery steps remain required.",
        resources: [
          { title: "Boundaries — Guided Notes", description: "Scott's verified punctuation and sentence-boundary notes.", document: "1uSCn7LzddC1-DnCzy7j4MfRRb2SX6CHkZiy4qBd19uY" },
        ],
        steps: [
          { title: "Watch the Punctuation Video", description: "Scott's Punctuation Foundations lesson is the verified source video for this step.", video: vimeoVideo("1204604943", "5b3524d305"), eyebrow: "Watch" },
          { title: "Complete Independent Clause practice", description: "Practice Boundaries until you reach 100%, then screenshot the summary page.", href: readingPractice("Boundaries"), actionLabel: "Practice boundaries", eyebrow: "Practice" },
          { title: "Memorize the Punctuation Flashcards", description: "Screenshot the mastered set for proof.", eyebrow: "Flashcards", unavailable: true },
          { title: "Complete Punctuation practice", description: "Follow the exact process shown in Scott's answer key and save your results.", href: readingPractice("Boundaries"), actionLabel: "Practice punctuation", eyebrow: "Practice" },
        ],
        submission: "Post the required screenshots in Community as “Days 8 & 9 Done!”",
      },
      {
        title: "Days 10 & 11",
        summary: "Master verbs, agreement, modifiers, and the rest of Scott's core grammar system.",
        estimatedMinutes: 100,
        resources: [
          { title: "Form, Structure, and Sense — Guided Notes", description: "Scott's verified grammar notes for verbs, agreement, and sentence structure.", document: "1hfsjPPuv2goRcyfyd8fU9z2SNtIiKkcsZEZOOwzLqjw" },
        ],
        steps: [
          { title: "Watch Form, Structure, and Sense", video: vimeoVideo("1205142292", "4df612a33c"), eyebrow: "Watch" },
          { title: "Complete Verbs practice", description: "Continue until your process matches the answer key on every question, then screenshot the summary.", href: readingPractice("Form, Structure, and Sense"), actionLabel: "Practice verbs and structure", eyebrow: "Practice" },
          { title: "Watch Other Grammar", video: vimeoVideo("1205153404", "7264c1e04c"), eyebrow: "Watch" },
          { title: "Memorize the Other Grammar Flashcards", description: "Screenshot the mastered set for proof.", eyebrow: "Flashcards", unavailable: true },
        ],
        submission: "Post both summary screenshots in Community as “Days 10 & 11 Done!”",
      },
      {
        title: "Day 12",
        summary: "Measure grammar mastery, diagnose misses, and begin the 25-pattern grammar drill.",
        estimatedMinutes: 80,
        steps: [
          { title: "Take the Grammar Mastery Quiz", description: "For every miss, write why you got it wrong and how you will prevent the same error.", eyebrow: "Mastery quiz", unavailable: true },
          { title: "Watch How to Use the Grammar Drill", video: vimeoVideo("1205265626", "ca44431284"), eyebrow: "Watch" },
          { title: "Master 15 of 25 grammar patterns", description: "Work in the Grammar Drill until you reach 15/25, then screenshot the result.", href: "/ultimate/drills", actionLabel: "Open Grammar Drill", eyebrow: "Drill" },
        ],
        submission: "Post the quiz and 15/25 drill screenshots in Community as “Day 12 Done!”",
      },
      {
        title: "Days 13 & 14",
        summary: "Finish the grammar drill and transfer the process into a full Reading and Writing section.",
        estimatedMinutes: 120,
        steps: [
          { title: "Master all 25 grammar patterns", description: "Finish the Grammar Drill at 25/25.", href: "/ultimate/drills", actionLabel: "Continue Grammar Drill", eyebrow: "Drill" },
          { title: "Watch the English Section Walkthrough", video: vimeoVideo("1205267754", "e2ca42d784"), eyebrow: "Watch" },
          { title: "Take an English practice-test section", description: "Focus on getting every grammar question right and screenshot your results.", href: "/ultimate/tests", actionLabel: "Open practice tests", eyebrow: "Practice test" },
          { title: "Review every missed grammar question", description: "Identify why you missed it, then return to the exact video and drill pattern until the mistake is fixed.", eyebrow: "Review" },
        ],
        submission: "Post the drill and practice-test screenshots in Community as “Days 13 & 14 Done!”",
      },
    ],
  },
  {
    title: "Geometry & Non-Desmos Math (Week 3)",
    description: "Build the formulas and by-hand methods for data, probability, geometry, and the questions that are faster without Desmos.",
    days: [
      {
        title: "Days 15 & 16",
        summary: "Master data, unit conversion, and percent questions without relying on calculator shortcuts.",
        estimatedMinutes: 140,
        resources: [
          { title: "One-Variable Data — Guided Notes", description: "Scott's verified data notes.", document: "1ul8BVkGdTASRdlcveKQveH_SinZLRW6DZJkJlU6x72g" },
          { title: "Two-Variable Data — Guided Notes", description: "Scott's verified models and scatterplots notes.", document: "1LHagOf6s9J-4J8PV0eeUbrEvZYnhrVwgwUaSs_bRXBc" },
          { title: "Units — Guided Notes", description: "Scott's verified ratios, rates, and units notes.", document: "1-cUP0chgO2Jpzv7wSao7mJriUlsMVcvZtoSk2U4eKVg" },
          { title: "Percentages — Guided Notes", description: "Scott's verified percent notes.", document: "1evPDPbGh4KjBtpIUKLGrUzTtcFnjjm1eKuY10QbqawQ" },
        ],
        steps: [
          { title: "Watch One-Variable Data", video: vimeoVideo("1205282254", "8b967f5ec6"), eyebrow: "Watch" },
          { title: "Complete One-Variable Data practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("One-variable data: distributions and measures of center and spread"), actionLabel: "Practice one-variable data", eyebrow: "Practice" },
          { title: "Watch Two-Variable Data", video: vimeoVideo("1205304082", "76769a334e"), eyebrow: "Watch" },
          { title: "Complete Two-Variable Data practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Two-variable data: models and scatterplots"), actionLabel: "Practice two-variable data", eyebrow: "Practice" },
          { title: "Watch Converting Units", video: vimeoVideo("1205314854", "11fcb70e0e"), eyebrow: "Watch" },
          { title: "Complete Converting Units practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Ratios, rates, proportional relationships, and units"), actionLabel: "Practice unit conversions", eyebrow: "Practice" },
          { title: "Watch Percents", video: vimeoVideo("1208597569", "6c5adee185"), eyebrow: "Watch" },
          { title: "Complete Percents practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Percentages"), actionLabel: "Practice percentages", eyebrow: "Practice" },
        ],
        submission: "Post all four completion screenshots in Community as “Days 15 & 16 Done!”",
      },
      {
        title: "Days 17 & 18",
        summary: "Build probability, sampling, angle, and right-triangle fluency.",
        estimatedMinutes: 145,
        resources: [
          { title: "Probability — Guided Notes", description: "Scott's verified probability notes.", document: "1odXlrOGTvjjkr8ET2niSq3c_KyCfDd1mHCafEKMFQBQ" },
          { title: "Inference and Samples — Guided Notes", description: "Scott's verified sampling and margin-of-error notes.", document: "1W3kNJA793JdmPRUBsE8l7oOxiaEN7WBzC1mRXOx425g" },
          { title: "Lines, Angles, and Triangles — Guided Notes", description: "Scott's verified geometry notes.", document: "1XbqXmEncH5prh2UkDYFLmr_fPEJpzc01k3uu7bucMNE" },
          { title: "Right Triangles — Guided Notes", description: "Scott's verified trigonometry notes.", document: "1X4uMnrMI9ZkmTW0-DWyvcS6YkgoMRANcHS6O_NpxuNU" },
        ],
        steps: [
          { title: "Watch Probability", video: vimeoVideo("1208607371", "9c91a286e6"), eyebrow: "Watch" },
          { title: "Complete Probability practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Probability and conditional probability"), actionLabel: "Practice probability", eyebrow: "Practice" },
          { title: "Watch Applying Samples", description: "Scott's Applying Samples Foundations lesson is the verified source video for this step.", video: vimeoVideo("1208841697", "4e6da21368"), eyebrow: "Watch" },
          { title: "Complete Applying Samples practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Inference from sample statistics and margin of error"), actionLabel: "Practice sampling", eyebrow: "Practice" },
          { title: "Watch Angles and Special Triangles", description: "Scott's Angles and Triangles Foundations lesson is the verified source video for this step.", video: vimeoVideo("1208903062", "44cb931e3f"), eyebrow: "Watch" },
          { title: "Complete Angles and Special Triangles practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Lines, angles, and triangles"), actionLabel: "Practice angles and triangles", eyebrow: "Practice" },
          { title: "Watch Right Triangles", video: vimeoVideo("1208913804", "fdd8d7a89d"), eyebrow: "Watch" },
          { title: "Complete Right Triangles practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Right triangles and trigonometry"), actionLabel: "Practice right triangles", eyebrow: "Practice" },
        ],
        submission: "Post all four completion screenshots in Community as “Days 17 & 18 Done!”",
      },
      {
        title: "Days 19 & 20",
        summary: "Finish geometry and apply the process to proofs, circles, area, volume, and challenging word problems.",
        estimatedMinutes: 155,
        resources: [
          { title: "Area and Volume — Guided Notes", description: "Scott's verified area and volume notes.", document: "1dVkIy4kuZf5ckVc6EfTm2H7RDSPMm6DWct5Pd_FOOWY" },
          { title: "Circles — Guided Notes", description: "Scott's verified circle notes.", document: "1eh1QCg6p45ejoHuBODb9TEBNr-Poe0rzPbMb4emfrHg" },
        ],
        steps: [
          { title: "Watch Triangle Similarity", description: "Scott's Similar Triangles Foundations lesson is the verified source video for this step.", video: vimeoVideo("1209105338", "f37ca94fea"), eyebrow: "Watch" },
          { title: "Watch Area and Volume", video: vimeoVideo("1209129397", "6a8169997d"), eyebrow: "Watch" },
          { title: "Complete Area and Volume practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Area and volume"), actionLabel: "Practice area and volume", eyebrow: "Practice" },
          { title: "Watch Circle Theory", video: vimeoVideo("1209329212", "11ae9427c0"), eyebrow: "Watch" },
          { title: "Complete Circle Theory practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Circles"), actionLabel: "Practice circles", eyebrow: "Practice" },
          { title: "Watch Triangle Proofs", description: "Scott's Triangle Proofs Foundations lesson is the verified source video for this step.", video: vimeoVideo("1209336087", "5c4569122b"), eyebrow: "Watch" },
          { title: "Complete Triangle Proofs practice", description: "Continue until you reach 100%, then screenshot the summary.", href: mathPractice("Lines, angles, and triangles"), actionLabel: "Practice triangle proofs", eyebrow: "Practice" },
          { title: "Watch Breaking Down Word Problems", description: "Scott's General Word Problems Foundations lesson is the verified source video for this step.", video: vimeoVideo("1209357514", "ce466f47b1"), eyebrow: "Watch" },
          { title: "Watch Function Word Problems", video: vimeoVideo("1209895268", "0b48bb0e21"), eyebrow: "Watch" },
          { title: "Complete Challenging Word Problems practice", description: "The original named practice set was not included in the shared Drive.", eyebrow: "Practice", unavailable: true },
        ],
        submission: "Post every available practice screenshot in Community as “Days 19 & 20 Done!”",
      },
      {
        title: "Day 21",
        summary: "Finish the non-Desmos track, test the full Math section, and repair every remaining weakness.",
        estimatedMinutes: 125,
        steps: [
          { title: "Watch Miscellaneous Hacks", eyebrow: "Watch", unavailable: true },
          { title: "Memorize the Non-Desmos Flashcards", eyebrow: "Flashcards", unavailable: true },
          { title: "Take the Non-Desmos Mastery Quiz", description: "Review every missed question and screenshot the summary page.", eyebrow: "Mastery quiz", unavailable: true },
          { title: "Watch the final review video", description: "Scott's Take a Math Section video is the verified source for this step.", video: vimeoVideo("1212396327", "f86c597b0c"), eyebrow: "Watch" },
          { title: "Take a full Math practice-test section", description: "Screenshot your results when finished.", href: "/ultimate/tests", actionLabel: "Open practice tests", eyebrow: "Practice test" },
          { title: "Review every missed question", description: "Name the error, return to the matching lesson, and repeat the relevant practice until the mistake is fixed.", eyebrow: "Review" },
        ],
        submission: "Post every available screenshot in Community as “Day 21 Done!”",
      },
    ],
  },
];

const math: SourceModule[] = [
  {
    title: "Start Here",
    description: "Set your Math pacing, choose the right score-band priorities, and learn how to use the course before studying individual domains.",
    lessons: [
      {
        title: "How to Use This Course",
        intro: "Start with this walkthrough before opening a domain. For each subtopic, learn Scott's process in the video, review the guided notes, and immediately apply the process in focused practice.",
        video: "1HwJfe0VscmFHCoNMowdD5AHVk4SBD_S1",
      },
      {
        title: "Pacing on Math",
        intro: "Build a deliberate pacing plan before you practice. Protect time for the hardest questions, choose the fastest reliable method, and leave room to verify flagged answers.",
        video: "1QRanVLjOYQC_8R_qMGUjRn1KUQJHEoC4",
      },
      {
        title: "Priorities Below a 1000 SAT Score",
        intro: "Make Desmos and core algebra your first priorities. Learn the fundamentals before complex problems, stop memorizing low-value formulas and hacks, and set a realistic score target while you build consistency.",
        video: "1ydI2R9_3J_lDsxjSx1St2TmlmdmA8UlT",
        notes: "1bj4VnmzwKBuDJ2PIbfxIjf7EFDlHLNRY8VC6_p-NANw",
      },
      {
        title: "Priorities for a 1000–1290 SAT Score",
        intro: "Pair Desmos with real mathematical understanding. Prioritize accuracy, master core algebra and functions, recognize repeated SAT patterns, translate word problems carefully, and track the mistakes that keep recurring.",
        video: "1RYJAExoRjHf0VrwjXr33Lkh1_YwoU7_m",
        notes: "1L0bIAIaeqUrgKfB4Cb__TI-xKtFxp54zdQ-17R-9RGA",
      },
      {
        title: "Priorities for a 1300+ SAT Score",
        intro: "Use Desmos for speed, precision, and verification. At this level, improvement comes from efficient method selection, advanced graph behavior, pattern recognition, and eliminating execution errors under time pressure.",
        video: "12EvmZhR5FPDM3qxaCE3G40iez6Bmi_RN",
        notes: "141KFJuj3oyq3c4tdD70QtCCGyy_5ih0nCOH1L9C6Ans",
      },
    ],
  },
  {
    title: "Algebra",
    description: "Master the linear relationships that drive the largest share of SAT Math questions.",
    lessons: [
      {
        title: "Linear Equations in One Variable",
        intro: "Treat these as high-confidence points. Use Desmos for solution counts and direct solving, graph equations separately when needed, and use Scott's point method to test word-problem relationships and answer choices.",
        video: "110mn8CpbSh6yncK8SsJIX2jWoobWv0k0",
        notes: "1zYynzU1abCBjCxRY5u3UAnhszg1PQtQUrYTi4oQWJo0",
        practiceSkills: ["Linear equations in one variable"],
      },
      {
        title: "Linear Functions",
        intro: "Use graphs, tables, equations, and points interchangeably. Recognize x- and y-intercepts, translate function notation, and use pairs of points to expose rate of change and context.",
        video: "1dWXcTLNaoRMQZWei07yALC5956cGUMj1",
        notes: "1oagZ--sVPdpZ18fhfmAaGRqnuW-zPL_DurMMIKuZiTE",
        practiceSkills: ["Linear functions"],
      },
      {
        title: "Linear Equations in Two Variables",
        intro: "Focus on setting up and interpreting equations, intercepts, parallel and perpendicular lines, and percent-solution questions. Scott's notes emphasize writing the equation before solving and using points to verify the model.",
        video: "1J8KZYeI3zf_vrhk2BG65DuGjaYGgo8EK",
        notes: "1bx9YMnKDKvGOljQ-xtMIwW6IpfQruAufddJGYPLLEdk",
        practiceSkills: ["Linear equations in two variables"],
      },
      {
        key: "Systems of Two Linear Equations",
        title: "Systems of Two Linear Equations in Two Variables",
        intro: "Make systems automatic: graph both equations, read the intersection, use sliders for constants, and fall back on Scott's point method when a relationship is described in words.",
        video: "1zGjad_5seabC-nUMP93lJyv2EB3SzHVX",
        notes: "1WDkZ4AHZ9-vT3Nn1gZzHeb73sarmbMcy3zvnsyI_RVQ",
        practiceSkills: ["Systems of two linear equations in two variables"],
      },
      {
        title: "Linear Inequalities in One or Two Variables",
        intro: "Approach inequalities like systems while respecting the inequality sign and every defined variable. Translate phrases such as “at most,” graph the feasible region, and test points against the original constraints.",
        video: "1uQyRbzFxMe_YOkxkVwc5oXRtMMNhdeOw",
        notes: "1o98x1SsNYW4vLiq1F7s-eO0Fbzt2eCNTbHzW6fyQaNs",
        practiceSkills: ["Linear inequalities in one or two variables"],
      },
    ],
  },
  {
    title: "Advanced Math",
    description: "Extend the algebra foundation into equivalent expressions, nonlinear equations, and nonlinear models.",
    lessons: [
      {
        title: "Equivalent Expressions",
        intro: "Match the method to the expression: graph when two forms can be compared visually, use a tilde to solve for constants, and substitute safe values when direct comparison is faster.",
        video: "1TeB-pFmm_lkYWsRfEaH2Yaf8npLZ50C3",
        notes: "1m7OCQuQ-QJLm7Gz7U_WpZKcVwMTwzaQd_3kVmfnk3dI",
        practiceSkills: ["Equivalent expressions"],
      },
      {
        key: "Nonlinear Equations and Systems",
        title: "Nonlinear Equations in One Variable and Systems of Equations in Two Variables",
        intro: "Combine the algebra and Desmos fundamentals you already learned. Graph nonlinear relationships, use sliders for unknown constants, and keep the problem's integer and domain constraints visible while solving.",
        video: "1DSEM56spSi-8QQeXOSnMzGbKh_t3Bqbe",
        notes: "170wc4KG-5cgXM9GoEW6eEgb31zHT-6eUjIK13Kq9wi8",
        practiceSkills: ["Nonlinear equations in one variable and systems of equations in two variables"],
      },
      {
        title: "Nonlinear Functions",
        intro: "Recognize quadratic, cubic, quartic, and exponential behavior. Use points and graph features to interpret models, then use lists and custom regressions when the relationship is not immediately obvious.",
        video: "1ykWm6jiPiSPgOLFpeI_9tET_i5iYsVOn",
        notes: "1DiJUW0ba-t_kjgiWoVyEtywpEEAcTObCfQ0VS1Lic74",
        practiceSkills: ["Nonlinear functions"],
      },
    ],
  },
  {
    title: "Problem-Solving and Data Analysis",
    description: "Translate real-world relationships, analyze data, and make statistically defensible conclusions.",
    lessons: [
      {
        title: "Ratios, Rates, Proportional Relationships, and Units",
        intro: "Set ratios up directly in Desmos, use simple dummy values for difficult proportions, translate “per” and “on average” as division, and move through unit conversions one step at a time.",
        video: "1xQf969ZulXGxgF15OdnLoQwZ7sbikbQt",
        notes: "1-cUP0chgO2Jpzv7wSao7mJriUlsMVcvZtoSk2U4eKVg",
        practiceSkills: ["Ratios, rates, proportional relationships, and units"],
      },
      {
        title: "Percentages",
        intro: "Translate percent language before calculating: “of” becomes a decimal multiplier, “less” becomes 1 − p, and “more” becomes 1 + p. Use a Desmos list when several percentage relationships interact.",
        video: "1chSGVB4kqXEyRdPcq7tSRrqDkDXEO77m",
        notes: "1evPDPbGh4KjBtpIUKLGrUzTtcFnjjm1eKuY10QbqawQ",
        practiceSkills: ["Percentages"],
      },
      {
        key: "One-Variable Data",
        title: "One-Variable Data: Distributions and Measures of Center and Spread",
        intro: "Use Desmos for mean, median, and standard deviation; identify mode by frequency; connect total to mean × quantity; and use distribution shape to reason about center and spread.",
        video: "1AsbNkJ0OZ3uDBHeLiFTETg5cuarmBjuz",
        notes: "1ul8BVkGdTASRdlcveKQveH_SinZLRW6DZJkJlU6x72g",
        practiceSkills: ["One-variable data: distributions and measures of center and spread"],
      },
      {
        key: "Two-Variable Data",
        title: "Two-Variable Data: Models and Scatterplots",
        intro: "Read scatterplots and lines of best fit, connect slope to average rate of change, and decide when a visual estimate is enough versus when a point should be substituted into the model.",
        video: "13mch_pF4eJK3fHoXp2HrCSDGhhFP-ZZS",
        notes: "1LHagOf6s9J-4J8PV0eeUbrEvZYnhrVwgwUaSs_bRXBc",
        practiceSkills: ["Two-variable data: models and scatterplots"],
      },
      {
        title: "Probability and Conditional Probability",
        intro: "For conditional probability, put the “given” group in the denominator and count only outcomes inside that condition. Use a tilde when the remaining work becomes an awkward percent equation.",
        video: "1_LB7YGuuYPbwmQLzS4UOCQYmp4jCK4VH",
        notes: "1odXlrOGTvjjkr8ET2niSq3c_KyCfDd1mHCafEKMFQBQ",
        practiceSkills: ["Probability and conditional probability"],
      },
      {
        key: "Inference and Margin of Error",
        title: "Inference from Sample Statistics and Margin of Error",
        intro: "Treat margin of error as a plausible range, not a guarantee. Reject claims using “exactly,” “never,” or “impossible,” and keep the sample and target population aligned before scaling a result.",
        video: "1OLim8_1SbkTc6j-HOIlBQ3ikNRvbosuT",
        notes: "1W3kNJA793JdmPRUBsE8l7oOxiaEN7WBzC1mRXOx425g",
        practiceSkills: ["Inference from sample statistics and margin of error"],
      },
      {
        key: "Evaluating Statistical Claims",
        title: "Evaluating Statistical Claims: Observational Studies and Experiments",
        intro: "Generalize only to the population from which a representative random sample was selected. Distinguish association from causation, respect sampling uncertainty, and prefer the most limited defensible conclusion.",
        video: "1oCJ99KXonslyCoICOXQWuP9PQ72oXGwq",
        notes: "1_xmVq9NlxVuHHUvn1iytohmcnxl2N3Yatcfq2GLLQzY",
        practiceSkills: ["Evaluating statistical claims: observational studies and experiments"],
      },
    ],
  },
  {
    title: "Geometry and Trigonometry",
    description: "Build reliable diagrams, choose the right formulas, and connect geometry to algebra and Desmos.",
    lessons: [
      {
        title: "Area and Volume",
        intro: "Start from the provided SAT formula sheet, add the few surface-area and angle formulas Scott identifies, draw and label the figure, and use a tilde to simplify the algebra in ratio problems.",
        video: "1VkAAquoO5ihUfPshJbyvJdIoRte9T8Gn",
        notes: "1dVkIy4kuZf5ckVc6EfTm2H7RDSPMm6DWct5Pd_FOOWY",
        practiceSkills: ["Area and volume"],
      },
      {
        title: "Lines, Angles, and Triangles",
        intro: "Know vertical, supplementary, and complementary angle relationships; recognize isosceles triangles; use the 180° triangle sum; and draw directly on the figure before doing algebra.",
        video: "1SOSNkDmaS6wZoa3SLtssFBSlbGqSZQp7",
        notes: "1XbqXmEncH5prh2UkDYFLmr_fPEJpzc01k3uu7bucMNE",
        practiceSkills: ["Lines, angles, and triangles"],
      },
      {
        title: "Right Triangles and Trigonometry",
        intro: "Combine SOHCAHTOA, the Pythagorean theorem, ratios, similarity, perimeter, and special right triangles. Scott's core rule is that a correct labeled setup makes the rest of the problem manageable.",
        video: "1gIStzgxDKMKGk1sZvxfHygC3YpRsAo7-",
        notes: "1X4uMnrMI9ZkmTW0-DWyvcS6YkgoMRANcHS6O_NpxuNU",
        practiceSkills: ["Right triangles and trigonometry"],
      },
      {
        title: "Circles",
        intro: "Master standard form, radius and diameter, circumference, radians, arc length, and central versus inscribed angles. Use Desmos to verify the geometry whenever the graph makes the relationship clearer.",
        video: "1qArDoYGdrKPUATS92Wiv3Bxb9fJosbB1",
        notes: "1eh1QCg6p45ejoHuBODb9TEBNr-Poe0rzPbMb4emfrHg",
        practiceSkills: ["Circles"],
      },
    ],
  },
];

const readingWriting: SourceModule[] = [
  {
    title: "Start Here",
    description: "Choose the right starting point for your score, set your pacing, and learn Scott's Read–Analyze–Predict method before studying individual question types.",
    lessons: [
      {
        key: "Priorities Below a 500 Reading and Writing Score",
        title: "Start Here if Your Reading and Writing Score Is Below 500",
        intro: "Use this lesson if your current Reading and Writing score is below 500. Build the core grammar and comprehension foundation in Scott's priority order before moving into the full subtopic sequence.",
        videoMissing: true,
        notes: "1P2CvoJvyZb59H2bFNmoUMr5wkOfnmkSVa0VoFypyoHk",
      },
      {
        key: "Pacing and General Reading Strategies",
        title: "Pacing and General Reading Tips",
        intro: "Once you are around the 600 range, your biggest priorities become reading comprehension and execution. Use this lesson to set your question order, timing checkpoints, and general reading process.",
        video: "1_a7F0sUWIWSiKGXUcuDZI2-sjLwI6sdG",
        notes: "1qiMKJLP74b8jIxek7FlFyW6rYCxr7lndTcy4ZnmpHsE",
      },
      {
        key: "The Read–Analyze–Predict Method",
        title: "How to R-A-P: Read, Analyze, Predict",
        intro: "Learn Scott's repeatable Read–Analyze–Predict process. Apply it before looking at the answer choices so the choices do not control your interpretation of the passage.",
        video: "1OTOxKUAKqKsWQ9gNDmvacXgcN_bf7CM1",
        notes: "1xW5YIPVUzpTg4kUkwsn0IOURg3Pf7uSJXcayii7-rj8",
      },
    ],
  },
  {
    title: "Craft and Structure",
    description: "Words in context, text structure and purpose, and cross-text connections.",
    lessons: [
      {
        title: "Words in Context",
        video: "1iG8mhVLbd89v-YQeJB54MgOzQoAmXTo2",
        notes: "1n4SUIyAuZJKcfJuMkoX2TDhqOUvSRWWr0P24v1FzKXI",
        resources: [
          { title: "Word Parts Reference", description: "Use prefixes, roots, and suffixes to reason through unfamiliar vocabulary.", id: "1E9yffKgi2PKQ0cMYnS4Va2Zpw0cW5hGg7MDPxF2rvn0", kind: "spreadsheet", actionLabel: "Open word-parts sheet" },
          { title: "The 1,000 Most Common SAT Words", description: "SparkNotes vocabulary reference supplied with Scott's course.", url: "https://img.sparknotes.com/content/testprep/pdf/sat.vocab.pdf", actionLabel: "Open vocabulary PDF" },
        ],
        practiceSkills: ["Words in Context"],
      },
      { title: "Cross-Text Connections", video: "17Ev2w7omYCiSDZZm4tQ92ojFSIxGjiXa", notes: "1AAeft63HqtRrbIYaO6lBDWZy2aSj0_x2kJuCtrouEMw", practiceSkills: ["Cross-Text Connections"] },
      { title: "Text Structure and Purpose", video: "1z73bj6gglDWXrjNvA2hj1jey2QjpzyXi", notes: "1lQ-mE7RLsuig3GVw3kX8-DzWOsy4s6sh9zBAJH1NJrQ", practiceSkills: ["Text Structure and Purpose"] },
    ],
  },
  {
    title: "Information and Ideas",
    description: "Central ideas, evidence, and inference questions.",
    lessons: [
      { title: "Central Ideas and Details", video: "1pVGImrIvjwNwPu6y4cDy6AK9WVBhMfgR", notes: "1xX0Jac-8vVDOtUHcfytQCrB4EWYyo-hkR3MddFRVxyI", practiceSkills: ["Central Ideas and Details"] },
      { title: "Command of Evidence", video: "1hSMwAvixZ6SERBZN36PU8NMrMrSPMJYr", notes: "12_gbIM0bnUuEkysW2TGvFNbrg7Vwn6cGl6FJtYuEFCA", practiceSkills: ["Command of Evidence"] },
      { title: "Inferences", video: "1iFWY9-Rs0mCQ3JraV1Tzc8zQD-2KXpE_", notes: "1PLL-QZOmmmeqg7joIWVsUx1ASgS7C0Q4VLwh-wD9cKw", practiceSkills: ["Inferences"] },
    ],
  },
  {
    title: "Standard English Conventions",
    description: "Sentence boundaries, form, structure, and sense.",
    lessons: [
      { title: "Boundaries", video: "1p4yc1xtg_b3lR3nM1elKqNOaDJB0yFhy", notes: "1uSCn7LzddC1-DnCzy7j4MfRRb2SX6CHkZiy4qBd19uY", practiceSkills: ["Boundaries"] },
      { title: "Form, Structure, and Sense", video: "1G9yV5zXFvEjtgRpI05iBiatCr467wdMS", notes: "1hfsjPPuv2goRcyfyd8fU9z2SNtIiKkcsZEZOOwzLqjw", practiceSkills: ["Form, Structure, and Sense"] },
    ],
  },
  {
    title: "Expression of Ideas",
    description: "Transitions and rhetorical synthesis.",
    lessons: [
      { title: "Transitions", video: "1RYojVhA07LJ8ENE_gMfwveN2zvwTYTHG", notes: "1rFnXicK4V4SYNat6AYr5km76Z-6XHzaH9xFQc_LiFLc", practiceSkills: ["Transitions"] },
      { title: "Rhetorical Synthesis", video: "1WXkQR3NHTtcr5vKSwwk1fM6mBmNunAhP", notes: "1xIIWQuzLMSD3jrTJhHG6zJXKVSumJVjo8HVyffTRPTc", practiceSkills: ["Rhetorical Synthesis"] },
    ],
  },
];

function lessonBlocks(lesson: SourceLesson, subject: "math" | "reading-writing"): LessonBlock[] {
  const blocks: Omit<LessonBlock, "id" | "position">[] = [];
  let step = 1;
  if (lesson.intro) blocks.push({ kind: "text", content: { body: lesson.intro } });
  if (lesson.video) blocks.push({ kind: "video", content: { url: driveVideo(lesson.video), title: `Watch: ${lesson.title}`, description: "Take notes and pause whenever you need to apply Scott's process yourself.", eyebrow: "Video lesson", step: String(step++) } });
  if (lesson.videoMissing) blocks.push({ kind: "video", content: { url: "", title: `Upload: ${lesson.title} video`, description: "The original course includes a video here, but that video was not present in Scott's shared Drive.", eyebrow: "Video lesson", step: String(step++), status: "unavailable" } });
  if (lesson.notes) blocks.push({ kind: "file", content: { url: driveDocument(lesson.notes), title: `${lesson.title} — Guided Notes`, description: "Open Scott's original notes and follow along with the lesson.", eyebrow: "Guided notes", step: String(step++), actionLabel: "Open guided notes", display: "card" } });
  for (const resource of lesson.resources ?? []) {
    const url = resource.url ?? (resource.kind === "spreadsheet" ? driveSpreadsheet(resource.id ?? "") : driveDocument(resource.id ?? ""));
    blocks.push({ kind: "file", content: { url, title: resource.title, description: resource.description, eyebrow: "Reference", step: String(step++), actionLabel: resource.actionLabel ?? "Open resource", display: "card" } });
  }
  if (lesson.practiceSkills?.length) {
    const practiceUrl = subject === "math" ? mathPractice(...lesson.practiceSkills) : readingPractice(...lesson.practiceSkills);
    const subjectLabel = subject === "math" ? "Math" : "Reading and Writing";
    blocks.push({ kind: "file", content: { url: practiceUrl, title: `Practice: ${lesson.title}`, description: `Apply Scott's process immediately using matching questions from the imported ${subjectLabel} bank.`, eyebrow: "Targeted practice", step: String(step++), actionLabel: "Start focused practice", display: "card" } });
  }
  return blocks.map((block, index) => ({ ...block, id: stableId(lesson.title, block.kind, block.content.title ?? "intro", String(index + 1)), position: index + 1 }));
}

function foundationLessonBlocks(courseSlug: string, weekTitle: string, day: FoundationDay): LessonBlock[] {
  const blocks: Omit<LessonBlock, "id" | "position">[] = [];
  if (day.intro) blocks.push({ kind: "text", content: { body: day.intro } });
  for (const resource of day.resources ?? []) {
    blocks.push({
      kind: "file",
      content: {
        url: driveDocument(resource.document),
        title: resource.title,
        description: resource.description,
        eyebrow: "Course notes",
        actionLabel: "Open guided notes",
        display: "card",
      },
    });
  }
  for (const [stepIndex, step] of day.steps.entries()) {
    const content = {
      title: step.title,
      description: step.description,
      eyebrow: step.eyebrow,
      step: String(stepIndex + 1),
      actionLabel: step.actionLabel,
    };
    if (step.video) {
      blocks.push({ kind: "video", content: { ...content, url: step.video } });
      continue;
    }
    if (step.href) {
      blocks.push({ kind: "file", content: { ...content, url: step.href, display: "card" } });
      continue;
    }
    blocks.push({
      kind: "text",
      content: {
        ...content,
        body: step.description ?? (step.unavailable ? "This exact resource was not included in Scott's shared Drive." : "Complete this step before continuing."),
        status: step.unavailable ? "unavailable" : "instruction",
      },
    });
  }
  if (day.submission) {
    blocks.push({
      kind: "file",
      content: {
        url: "/ultimate/community",
        title: "Submit your proof of completion",
        description: day.submission,
        eyebrow: "Assignment submission",
        actionLabel: "Open Community",
        display: "card",
      },
    });
  }
  return blocks.map((block, index) => ({
    ...block,
    id: stableId(courseSlug, weekTitle, day.title, block.kind, block.content.title ?? "intro", String(index + 1)),
    position: index + 1,
  }));
}

function foundationCourse(): CourseInput {
  const slug = "blueprint-foundations";
  const modules: CourseModule[] = foundationWeeks.map((week, weekIndex) => ({
    id: stableId(slug, week.title),
    slug: slugify(week.title),
    title: week.title,
    description: week.description,
    position: weekIndex + 1,
    status: "published",
    lessons: week.days.map((day, dayIndex) => ({
      id: stableId(slug, week.title, day.title),
      slug: slugify(day.title),
      title: day.title,
      summary: day.summary,
      position: dayIndex + 1,
      estimatedMinutes: day.estimatedMinutes,
      status: "published" as const,
      completed: false,
      blocks: foundationLessonBlocks(slug, week.title, day),
    })),
  }));
  const estimatedMinutes = modules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.estimatedMinutes, 0);
  return {
    id: stableId(slug),
    slug,
    title: "Blueprint Foundations",
    description: "A guided 21-day foundation across Desmos, SAT grammar, geometry, data, and non-Desmos math—organized into three focused weeks.",
    eyebrow: "Your first 3 weeks",
    coverUrl: null,
    position: 1,
    estimatedMinutes,
    status: "published",
    modules,
  };
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
      const lessonKey = lesson.key ?? lesson.title;
      const subject = slug === "math-subtopic-course" ? "math" : "reading-writing";
      const blocks = lessonBlocks(lesson, subject).map((block) => ({ ...block, id: stableId(slug, module.title, lessonKey, block.kind, String(block.position)) }));
      return {
        id: stableId(slug, module.title, lessonKey),
        slug: slugify(lessonKey),
        title: lesson.title,
        summary: lesson.intro?.split(/(?<=[.!?])\s+/)[0] ?? (lesson.video && lesson.notes ? "Video lesson with Scott's guided notes." : lesson.video ? "Video lesson." : "Scott's guided notes."),
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
  foundationCourse(),
  course("math-subtopic-course", "Math Subtopic Course", "Master every Digital SAT math domain with Scott's strategy videos, guided notes, and focused practice.", "Math curriculum", 2, math),
  course("reading-writing-subtopic-course", "Reading and Writing Subtopic Course", "Learn Scott's Reading and Writing process across every tested Digital SAT domain.", "Reading and Writing curriculum", 3, readingWriting),
];

async function main() {
  const write = process.argv.includes("--write");
  const requestedSlug = process.argv.find((argument) => argument.startsWith("--course="))?.slice("--course=".length);
  const selectedCourses = requestedSlug ? courses.filter((item) => item.slug === requestedSlug) : courses;
  if (selectedCourses.length === 0) throw new Error(`Unknown course slug: ${requestedSlug}`);
  const modules = selectedCourses.flatMap((item) => item.modules);
  const lessons = modules.flatMap((module) => module.lessons);
  const blocks = lessons.flatMap((lesson) => lesson.blocks);
  const invalidUrl = blocks.map((block) => block.content.url).filter((url): url is string => Boolean(url)).find((url) => {
    if (url.startsWith("/")) return false;
    try { new URL(url); return false; } catch { return true; }
  });
  if (invalidUrl) throw new Error(`Invalid course resource URL: ${invalidUrl}`);
  console.log(`Courses: ${selectedCourses.length}\nModules: ${modules.length}\nLessons: ${lessons.length}\nBlocks: ${blocks.length}`);
  for (const item of selectedCourses) console.log(`- ${item.title}: ${item.modules.length} modules, ${item.modules.flatMap((module) => module.lessons).length} lessons`);
  if (!write) { console.log("Audit only. Add --write to import."); return; }
  for (const item of selectedCourses) {
    if (!(await saveCourse(item))) throw new Error(`Failed to import ${item.slug}`);
    console.log(`Imported ${item.slug}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
