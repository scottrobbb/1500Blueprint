const IDEMPOTENCY_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function readIdempotencyToken(
  value: unknown,
  options: { minLength?: number; maxLength?: number } = {},
): string | null {
  const minLength = options.minLength ?? 8;
  const maxLength = options.maxLength ?? 160;
  if (
    typeof value !== "string"
    || value.length < minLength
    || value.length > maxLength
    || value.trim() !== value
    || !IDEMPOTENCY_TOKEN_PATTERN.test(value)
  ) {
    return null;
  }
  return value;
}
