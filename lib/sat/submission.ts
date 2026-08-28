import type { AnswerMap, ModuleVariant, SectionId } from "./types";

export function sanitizeAnswerMap(value: unknown, allowedIds: ReadonlySet<string>): AnswerMap | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > allowedIds.size) return null;
  const result: AnswerMap = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!allowedIds.has(id) || typeof answer !== "string" || answer.length > 500) return null;
    result[id] = answer;
  }
  return result;
}

export function sanitizePerQuestionTime(
  value: unknown,
  allowedIds: ReadonlySet<string>,
): Record<string, number> | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > allowedIds.size) return null;
  const result: Record<string, number> = {};
  for (const [id, seconds] of Object.entries(value)) {
    if (!allowedIds.has(id) || typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
    result[id] = Math.max(0, Math.min(Math.round(seconds), 86_400));
  }
  return result;
}

export function sanitizeRouted(
  value: unknown,
): Partial<Record<SectionId, ModuleVariant>> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "rw" && key !== "math")) return null;
  const result: Partial<Record<SectionId, ModuleVariant>> = {};
  for (const key of keys as SectionId[]) {
    const variant = value[key];
    if (variant !== "easy" && variant !== "hard") return null;
    result[key] = variant;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
