type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function isMissingTestSnapshotColumnError(error: DatabaseError | null | undefined): boolean {
  if (!error || (error.code !== "42703" && error.code !== "PGRST204")) return false;
  const description = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /\btest_(?:snapshot|title)\b/i.test(description);
}

export function isMissingModuleSnapshotColumnError(error: DatabaseError | null | undefined): boolean {
  if (!error || (error.code !== "42703" && error.code !== "PGRST204")) return false;
  const description = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /\bmodule_snapshot\b/i.test(description);
}
