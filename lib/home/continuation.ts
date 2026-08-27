import "server-only";

import { drillAllowance } from "@/lib/auth/access-control";
import { isAdminEmail } from "@/lib/auth/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { listDrills } from "@/lib/drills/admin-queries";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { drillTitle } from "@/lib/drills/registry";
import { listTests, loadTest } from "@/lib/sat/loadTest";
import { supabaseAdmin } from "@/utils/supabase/admin";
import {
  buildDrillHref,
  chooseHomeContinuation,
  describeTestPosition,
  drillContinuationDetail,
  isDrillSlug,
  isMissingRecentActivityTableError,
  normalizeDrillMetadata,
  readResumableTestPosition,
  type HomeContinuation,
  type StudyActivityInput,
  type StudyActivityMetadata,
} from "./continuation-policy";

export type { HomeContinuation, StudyActivityInput } from "./continuation-policy";

type TestSessionRow = {
  test_slug: string;
  state: unknown;
  updated_at: string;
};

type RecentActivityRow = {
  kind: "drill" | "flashcard_set";
  resource_id: string;
  metadata: unknown;
  last_opened_at: string;
};

type HistoricalDrillRow = {
  drill_slug: string;
  created_at: string;
};

type FlashcardSetRow = {
  id: string;
  owner_email: string;
  title: string;
  visibility: string;
};

export type RecordStudyActivityResult = "recorded" | "forbidden" | "not_found";

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadTestSessionCandidates(email: string): Promise<TestSessionRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("test_sessions")
    .select("test_slug,state,updated_at")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(12)
    .returns<TestSessionRow[]>();
  if (error) throw new Error(`Could not load resumable tests [${error.code}]: ${error.message}`);
  return data ?? [];
}

async function loadRecentActivityCandidates(email: string): Promise<RecentActivityRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("student_recent_activity")
    .select("kind,resource_id,metadata,last_opened_at")
    .eq("email", email)
    .order("last_opened_at", { ascending: false })
    .limit(20)
    .returns<RecentActivityRow[]>();
  if (isMissingRecentActivityTableError(error)) return [];
  if (error) throw new Error(`Could not load recent study activity [${error.code}]: ${error.message}`);
  return data ?? [];
}

async function loadHistoricalDrillCandidates(email: string): Promise<HistoricalDrillRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("drill_attempts")
    .select("drill_slug,created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<HistoricalDrillRow[]>();
  if (error) throw new Error(`Could not load recent drill history [${error.code}]: ${error.message}`);
  return data ?? [];
}

async function loadFlashcardSets(ids: string[]): Promise<FlashcardSetRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("flashcard_sets")
    .select("id,owner_email,title,visibility")
    .in("id", ids)
    .returns<FlashcardSetRow[]>();
  if (error) throw new Error(`Could not validate recent flashcard sets [${error.code}]: ${error.message}`);
  return data ?? [];
}

async function testContinuation(
  rows: TestSessionRow[],
  accessibleTests: Map<string, string>,
  includeDraft: boolean,
): Promise<HomeContinuation | null> {
  for (const row of rows) {
    if (!accessibleTests.has(row.test_slug)) continue;
    const position = readResumableTestPosition(row.state);
    if (!position) continue;
    const test = await loadTest(row.test_slug, { includeDraft });
    const section = test?.sections[position.sectionIndex];
    const testModule = position.moduleOrder === 1
      ? section?.module1
      : section?.module2[position.moduleVariant ?? "easy"];
    if (!test || !section || !testModule || testModule.questions.length === 0) continue;
    const safePosition = {
      ...position,
      questionIndex: Math.min(position.questionIndex, testModule.questions.length - 1),
    };
    return {
      kind: "practice_test",
      resumeMode: "exact",
      title: test.title,
      detail: describeTestPosition(safePosition),
      href: `/practice-test/${encodeURIComponent(row.test_slug)}`,
      updatedAt: row.updated_at,
    };
  }
  return null;
}

function drillContinuation(
  slug: string,
  metadata: StudyActivityMetadata,
  title: string,
  updatedAt: string,
): HomeContinuation | null {
  if (!isDrillSlug(slug)) return null;
  const safeMetadata = normalizeDrillMetadata(slug, metadata);
  return {
    kind: "drill",
    resumeMode: "reopen",
    title,
    detail: drillContinuationDetail(slug, safeMetadata),
    href: buildDrillHref(slug, safeMetadata),
    updatedAt,
  };
}

export async function getHomeContinuation(email: string): Promise<HomeContinuation | null> {
  const studentEmail = normalizedEmail(email);
  const isAdmin = isAdminEmail(studentEmail);

  // Resolve the exact-resume branch first. The lower-priority activity reads
  // are independent of one another and start together only when needed.
  const testRowsPromise = loadTestSessionCandidates(studentEmail);
  const testCatalogPromise = listTests({ includeDraft: isAdmin });
  const accessPromise = isAdmin ? Promise.resolve(null) : getStudentAccess(studentEmail);

  const [testRows, testCatalog, access] = await Promise.all([
    testRowsPromise,
    testCatalogPromise,
    accessPromise,
  ]);
  const allowedTestCount = isAdmin
    ? testCatalog.length
    : access?.active
      ? access.entitlements.fullTestLimit
      : 0;
  const accessibleTests = new Map(
    testCatalog.slice(0, allowedTestCount).map((test) => [test.slug, test.title]),
  );
  const exactTest = await testContinuation(testRows, accessibleTests, isAdmin);
  if (exactTest) return exactTest;

  const [recentRows, historicalRows, drills, allowance] = await Promise.all([
    loadRecentActivityCandidates(studentEmail),
    loadHistoricalDrillCandidates(studentEmail),
    listDrills(),
    isAdmin ? Promise.resolve({ allowed: true }) : drillAllowance(studentEmail),
  ]);
  const availableDrills = new Map(
    drills
      .filter((drill) => isAdmin || drill.status === "published")
      .map((drill) => [drill.slug, drill]),
  );

  const flashcardIds = [...new Set(
    recentRows
      .filter((row) => row.kind === "flashcard_set")
      .map((row) => row.resource_id),
  )];
  const flashcardSets = new Map(
    (await loadFlashcardSets(flashcardIds))
      .filter((set) => isAdmin || set.owner_email === studentEmail || set.visibility === "shared")
      .map((set) => [set.id, set]),
  );

  const recentContinuations: HomeContinuation[] = [];
  for (const row of recentRows) {
    if (row.kind === "drill") {
      if (!allowance.allowed || !isDrillSlug(row.resource_id)) continue;
      const drill = availableDrills.get(row.resource_id);
      if (!drill) continue;
      const continuation = drillContinuation(
        row.resource_id,
        normalizeDrillMetadata(row.resource_id, row.metadata),
        drill.title,
        row.last_opened_at,
      );
      if (continuation) recentContinuations.push(continuation);
      continue;
    }

    const set = flashcardSets.get(row.resource_id);
    if (!set) continue;
    recentContinuations.push({
      kind: "flashcard_set",
      resumeMode: "reopen",
      title: set.title.trim() || "Flashcard set",
      detail: "Study this flashcard set",
      href: `/flashcards/${encodeURIComponent(set.id)}/study`,
      updatedAt: row.last_opened_at,
    });
  }

  let historicalDrill: HomeContinuation | null = null;
  if (allowance.allowed) {
    for (const row of historicalRows) {
      if (!isDrillSlug(row.drill_slug)) continue;
      const drill = availableDrills.get(row.drill_slug);
      if (!drill) continue;
      historicalDrill = drillContinuation(
        row.drill_slug,
        {},
        drill.title || drillTitle(row.drill_slug),
        row.created_at,
      );
      if (historicalDrill) break;
    }
  }

  return chooseHomeContinuation(null, recentContinuations, historicalDrill);
}

async function loadFlashcardSet(id: string): Promise<FlashcardSetRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("flashcard_sets")
    .select("id,owner_email,title,visibility")
    .eq("id", id)
    .maybeSingle<FlashcardSetRow>();
  if (error) throw new Error(`Could not validate flashcard set [${error.code}]: ${error.message}`);
  return data;
}

export async function recordStudyActivity(
  email: string,
  input: StudyActivityInput,
): Promise<RecordStudyActivityResult> {
  const studentEmail = normalizedEmail(email);
  const isAdmin = isAdminEmail(studentEmail);

  if (input.kind === "drill") {
    if (!isDrillSlug(input.resourceId)) return "not_found";
    const drillSlug = input.resourceId;
    const [isPublished, allowance] = await Promise.all([
      canAccessDrillPublication(drillSlug, isAdmin),
      isAdmin ? Promise.resolve({ allowed: true }) : drillAllowance(studentEmail),
    ]);
    if (!isPublished) return "not_found";
    if (!allowance.allowed) return "forbidden";
  } else {
    const set = await loadFlashcardSet(input.resourceId);
    if (!set || (!isAdmin && set.owner_email !== studentEmail && set.visibility !== "shared")) {
      return "not_found";
    }
  }

  const metadata = input.kind === "drill"
    ? normalizeDrillMetadata(input.resourceId, input.metadata)
    : {};
  const lastOpenedAt = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("student_recent_activity")
    .upsert(
      {
        email: studentEmail,
        kind: input.kind,
        resource_id: input.resourceId,
        metadata,
        last_opened_at: lastOpenedAt,
      },
      { onConflict: "email,kind,resource_id" },
    );
  if (error) throw new Error(`Could not record study activity [${error.code}]: ${error.message}`);
  return "recorded";
}
