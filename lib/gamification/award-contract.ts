export type AwardRpcRow = {
  attempt_id: string;
  inserted: boolean;
  xp_awarded: number;
  new_achievement_ids: string[];
};

export function parseAwardRpcRow(value: unknown): AwardRpcRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.attempt_id !== "string"
    || row.attempt_id.length === 0
    || typeof row.inserted !== "boolean"
    || !Number.isSafeInteger(row.xp_awarded)
    || (row.xp_awarded as number) < 0
    || !Array.isArray(row.new_achievement_ids)
    || !row.new_achievement_ids.every((id) => typeof id === "string" && id.length > 0)
  ) {
    return null;
  }
  return row as AwardRpcRow;
}
