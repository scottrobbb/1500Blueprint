import { isAdminEmail } from "./admin";

const ULTIMATE_PREVIEW_EMAILS = (process.env.ULTIMATE_PREVIEW_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// The Ultimate workspace is private while it is being integrated. Existing
// admins retain access; ULTIMATE_PREVIEW_EMAILS can add non-admin reviewers
// without granting them access to Scott's CMS.
export function isUltimatePreviewEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  return isAdminEmail(normalizedEmail) || ULTIMATE_PREVIEW_EMAILS.includes(normalizedEmail);
}
