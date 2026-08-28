export type SafeErrorMetadata = {
  name: string;
  code?: string;
  type?: string;
  status?: number;
  requestId?: string;
  digest?: string;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (!error || typeof error !== "object") return { name: "UnknownError" };

  const candidate = error as Record<string, unknown>;
  const metadata: SafeErrorMetadata = {
    name: safeIdentifier(candidate.name) ?? "Error",
  };
  const code = safeIdentifier(candidate.code);
  const type = safeIdentifier(candidate.type);
  const requestId = safeIdentifier(candidate.requestId);
  const digest = safeIdentifier(candidate.digest);
  const status = numericStatus(candidate.statusCode) ?? numericStatus(candidate.status);
  if (code) metadata.code = code;
  if (type) metadata.type = type;
  if (status !== null) metadata.status = status;
  if (requestId) metadata.requestId = requestId;
  if (digest) metadata.digest = digest;
  return metadata;
}

export function safeErrorLabel(error: unknown): string {
  const metadata = safeErrorMetadata(error);
  return [metadata.name, metadata.type, metadata.code, metadata.status]
    .filter((value) => value !== undefined)
    .join(":")
    .slice(0, 200);
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : null;
}

function numericStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}
