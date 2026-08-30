import { notFound } from "next/navigation";
import { SetEditor } from "@/components/flashcards/SetEditor";
import { AccessGate } from "@/components/account/AccessGate";
import { isAdminEmail } from "@/lib/auth/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";

export default async function UltimateNewSetPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.flashcards) {
    return <AccessGate title="Build your own flashcard decks" description="Custom flashcard sets, sharing, and study tracking are included with Max." currentPlan={access.plan} />;
  }
  return (
    <SetEditor
      mode="create"
      allowSharing={isAdminEmail(session.email)}
      backHref="/ultimate/flashcards"
      viewBase="/ultimate/flashcards"
      variant="ultimate"
    />
  );
}
