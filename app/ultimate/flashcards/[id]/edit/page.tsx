import { notFound } from "next/navigation";
import { SetEditor } from "@/components/flashcards/SetEditor";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { canEditSet, getSetForViewer } from "@/lib/flashcards/queries";

export default async function UltimateEditSetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const { id } = await params;
  const set = await getSetForViewer(id, session.email);
  if (!set || !(await canEditSet(id, session.email))) notFound();

  return (
    <SetEditor
      mode="edit"
      setId={set.id}
      initial={{
        title: set.title,
        description: set.description ?? "",
        visibility: set.visibility,
        cards: set.cards.map((card) => ({
          term: card.term,
          definition: card.definition,
          termImageUrl: card.termImageUrl,
          definitionImageUrl: card.definitionImageUrl,
        })),
      }}
      allowSharing={isAdminEmail(session.email)}
      backHref={`/ultimate/flashcards/${id}`}
      viewBase="/ultimate/flashcards"
      variant="ultimate"
    />
  );
}
