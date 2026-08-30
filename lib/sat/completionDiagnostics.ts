export type CompletionFailureKind = "http" | "invalid_response" | "network";

export type CompletionFailureDiagnostic = {
  requestId: string;
  testSlug: string;
  kind: CompletionFailureKind;
  code: string;
  errorName: string;
  status?: number;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_TEST_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export function parseCompletionFailureDiagnostic(value: unknown): CompletionFailureDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !safeIdentifier(row.requestId)
    || !safeTestSlug(row.testSlug)
    || (row.kind !== "http" && row.kind !== "invalid_response" && row.kind !== "network")
    || !safeIdentifier(row.code)
    || !safeIdentifier(row.errorName)
  ) return null;
  const status = row.status === undefined ? undefined : numericStatus(row.status);
  if (status === null) return null;
  return {
    requestId: row.requestId,
    testSlug: row.testSlug,
    kind: row.kind,
    code: row.code,
    errorName: row.errorName,
    ...(status === undefined ? {} : { status }),
  };
}

export function completionFailureReference(diagnostic: CompletionFailureDiagnostic): string {
  return diagnostic.requestId.slice(0, 8);
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

function safeTestSlug(value: unknown): value is string {
  return typeof value === "string" && SAFE_TEST_SLUG.test(value);
}

function numericStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}
