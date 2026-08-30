import { notFound } from "next/navigation";
import { SetDetail } from "@/components/flashcards/SetDetail";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { canEditSet, getSetForViewer } from "@/lib/flashcards/queries";

export default async function UltimateSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.flashcards) {
    return <AccessGate title="Build your own flashcard decks" description="Custom flashcard sets, sharing, and study tracking are included with Max." currentPlan={access.plan} />;
  }

  const { id } = await params;
  const set = await getSetForViewer(id, session.email);
  if (!set) notFound();

  const editable = await canEditSet(id, session.email);
  return (
    <SetDetail
      set={set}
      editable={editable}
      variant="ultimate"
      backHref="/ultimate/flashcards"
      actionBase="/ultimate/flashcards"
    />
  );
}
