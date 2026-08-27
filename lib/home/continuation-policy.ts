import type { DrillSlug } from "@/lib/drills/types";

export type StudyActivityKind = "drill" | "flashcard_set";

export type StudyActivityMetadata = {
  difficulty?: "medium" | "hard";
  mode?: "ceased" | "bad-mold";
};

export type StudyActivityInput =
  | {
      kind: "drill";
      resourceId: DrillSlug;
      metadata: StudyActivityMetadata;
    }
  | {
      kind: "flashcard_set";
      resourceId: string;
      metadata: StudyActivityMetadata;
    };

export type HomeContinuation = {
  kind: "practice_test" | StudyActivityKind;
  resumeMode: "exact" | "reopen";
  title: string;
  detail: string;
  href: string;
  updatedAt: string;
};

export type ResumableTestPosition = {
  phase: "module" | "review" | "break" | "moduleOver";
  sectionIndex: 0 | 1;
  moduleOrder: 1 | 2;
  questionIndex: number;
  timeLeft: number;
  breakTarget?: "module2" | "nextSection";
  moduleVariant?: "easy" | "hard";
};

const DRILL_SLUGS = new Set<DrillSlug>([
  "grammar",
  "targeted-math",
  "reading",
  "word-scan",
  "vocab",
  "flashcards",
  "ai-math",
]);

const FLASHCARD_SET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const ACTIVE_TEST_PHASES = new Set<ResumableTestPosition["phase"]>([
  "module",
  "review",
  "break",
  "moduleOver",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isDrillSlug(value: string): value is DrillSlug {
  return DRILL_SLUGS.has(value as DrillSlug);
}

export function normalizeDrillMetadata(
  slug: DrillSlug,
  value: unknown,
): StudyActivityMetadata {
  const metadata = record(value);
  if (slug === "targeted-math") {
    return { difficulty: metadata?.difficulty === "hard" ? "hard" : "medium" };
  }
  if (slug === "word-scan") {
    return { mode: metadata?.mode === "bad-mold" ? "bad-mold" : "ceased" };
  }
  return {};
}

export function parseStudyActivityInput(value: unknown): StudyActivityInput | null {
  const body = record(value);
  if (!body || (body.kind !== "drill" && body.kind !== "flashcard_set")) return null;
  if (typeof body.resourceId !== "string") return null;
  const resourceId = body.resourceId.trim();

  if (body.kind === "drill") {
    if (!isDrillSlug(resourceId)) return null;
    return {
      kind: "drill",
      resourceId,
      metadata: normalizeDrillMetadata(resourceId, body.metadata),
    };
  }

  if (!FLASHCARD_SET_ID.test(resourceId)) return null;
  return { kind: "flashcard_set", resourceId, metadata: {} };
}

export function buildDrillHref(
  slug: DrillSlug,
  metadata: StudyActivityMetadata,
): string {
  if (slug === "targeted-math") {
    const difficulty = metadata.difficulty === "hard" ? "hard" : "medium";
    return `/drills/targeted-math?difficulty=${difficulty}`;
  }
  if (slug === "word-scan") {
    const mode = metadata.mode === "bad-mold" ? "bad-mold" : "ceased";
    return `/drills/word-scan?mode=${mode}`;
  }
  return `/drills/${slug}`;
}

export function drillContinuationDetail(
  slug: DrillSlug,
  metadata: StudyActivityMetadata,
): string {
  if (slug === "targeted-math") {
    return metadata.difficulty === "hard" ? "Hard difficulty" : "Medium difficulty";
  }
  if (slug === "word-scan") {
    return metadata.mode === "bad-mold" ? "Bad MOLD mode" : "CEASED mode";
  }
  return "Return to this practice activity";
}

export function readResumableTestPosition(value: unknown): ResumableTestPosition | null {
  const saved = record(value);
  const state = record(saved?.state);
  if (!state || typeof state.phase !== "string" || !ACTIVE_TEST_PHASES.has(state.phase as ResumableTestPosition["phase"])) {
    return null;
  }
  if (state.sectionIndex !== 0 && state.sectionIndex !== 1) return null;
  if (state.moduleOrder !== 1 && state.moduleOrder !== 2) return null;
  if (typeof state.qIndex !== "number" || !Number.isInteger(state.qIndex) || state.qIndex < 0 || state.qIndex > 99) return null;
  if (typeof state.timeLeft !== "number" || !Number.isFinite(state.timeLeft) || state.timeLeft < 0 || state.timeLeft > 86_400) return null;
  const routed = record(state.routed);
  const sectionKey = state.sectionIndex === 0 ? "rw" : "math";

  return {
    phase: state.phase as ResumableTestPosition["phase"],
    sectionIndex: state.sectionIndex,
    moduleOrder: state.moduleOrder,
    questionIndex: state.qIndex,
    timeLeft: Math.round(state.timeLeft),
    breakTarget: state.breakTarget === "module2" || state.breakTarget === "nextSection"
      ? state.breakTarget
      : undefined,
    moduleVariant: state.moduleOrder === 2
      ? routed?.[sectionKey] === "hard" ? "hard" : "easy"
      : undefined,
  };
}

export function describeTestPosition(position: ResumableTestPosition): string {
  const section = position.sectionIndex === 0 ? "Reading and Writing" : "Math";
  if (position.phase === "break") {
    return position.breakTarget === "nextSection"
      ? "Continue your break before Math"
      : `Continue your break before ${section}, Module 2`;
  }
  if (position.phase === "review" || position.phase === "moduleOver") {
    return `${section}, Module ${position.moduleOrder} review`;
  }
  return `${section}, Module ${position.moduleOrder}, Question ${position.questionIndex + 1}`;
}

export function chooseHomeContinuation(
  test: HomeContinuation | null,
  recentActivity: readonly HomeContinuation[],
  historicalDrill: HomeContinuation | null,
): HomeContinuation | null {
  return test ?? recentActivity[0] ?? historicalDrill;
}

export function isMissingRecentActivityTableError(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  return Boolean(
    error
    && (error.code === "42P01" || error.code === "PGRST205")
    && /student_recent_activity/i.test(error.message ?? ""),
  );
}
