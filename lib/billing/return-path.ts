export function billingReturnPath(
  value: FormDataEntryValue | string | null,
  fallback = "/settings/subscription",
): string {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return fallback;
  }
  return path;
}
