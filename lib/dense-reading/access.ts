import "server-only";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";

export async function getSessionForDenseReading() {
  const session = await getSession();
  if (!session) return null;
  const access = await getStudentAccess(session.email);
  const admin = isAdminEmail(session.email);
  if (
    !access.active ||
    (!admin && access.entitlements.dailyDrillLimit === null)
  )
    return null;
  if (!(await canAccessDrillPublication("dense-reading", admin))) return null;
  return session;
}
