// Kept under its original name so older routes can share the launch gate
// without a broad rename. Ultimate is now the student workspace for every
// authenticated account; plan entitlements control the features inside it.
export function isUltimatePreviewEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim());
}
