// Publication is stored on each content row. These helpers stay pure and
// edge-safe; database access belongs in the server query modules.
export type PublicationStatus = "draft" | "published";

const LEGACY_DRAFT_DRILLS = new Set(["targeted-math", "word-scan", "ai-math"]);
const LEGACY_DRAFT_TESTS = new Set(["practice-test-3", "practice-test-4", "practice-test-5"]);

export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return value === "draft" || value === "published";
}

export function canAccessPublication(status: PublicationStatus, isAdmin: boolean): boolean {
  return status === "published" || isAdmin;
}

// Code can be deployed before the status-column migration. This compatibility
// path mirrors the last hardcoded availability only for that narrow rollout
// window; database values remain authoritative as soon as the column exists.
export function legacyPublicationStatus(
  kind: "drill" | "test",
  slug: string,
): PublicationStatus {
  const drafts = kind === "drill" ? LEGACY_DRAFT_DRILLS : LEGACY_DRAFT_TESTS;
  return drafts.has(slug) ? "draft" : "published";
}

export function isMissingPublicationStatusColumn(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  return Boolean(
    error
    && (error.code === "42703" || error.code === "PGRST204")
    && /\bstatus\b/i.test(error.message ?? ""),
  );
}
