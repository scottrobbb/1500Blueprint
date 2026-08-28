export type RateLimitResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: string;
};

export function parseRateLimitResult(value: unknown): RateLimitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rate limit returned no result");
  }
  const result = value as Record<string, unknown>;
  const used = Number(result.used);
  const limit = Number(result.limit);
  if (
    typeof result.allowed !== "boolean"
    || !Number.isInteger(used)
    || used < 0
    || !Number.isInteger(limit)
    || limit < 1
    || typeof result.resetsAt !== "string"
    || !Number.isFinite(Date.parse(result.resetsAt))
  ) {
    throw new Error("Rate limit returned an invalid result");
  }
  return { allowed: result.allowed, used, limit, resetsAt: result.resetsAt };
}
