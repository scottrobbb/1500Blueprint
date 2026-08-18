import { notFound } from "next/navigation";
import { StudyDeck } from "@/components/flashcards/StudyDeck";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getSetForViewer } from "@/lib/flashcards/queries";

export default async function UltimateStudySetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const { id } = await params;
  const set = await getSetForViewer(id, session.email);
  if (!set) notFound();
  return <StudyDeck title={set.title} cards={set.cards} backHref={`/ultimate/flashcards/${id}`} variant="ultimate" />;
}
