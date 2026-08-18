import { notFound } from "next/navigation";
import { SetEditor } from "@/components/flashcards/SetEditor";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getSetForViewer } from "@/lib/flashcards/queries";

export default async function UltimateAdminEditSetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { id } = await params;
  const set = await getSetForViewer(id, session.email);
  if (!set) notFound();

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
      allowSharing
      backHref="/ultimate/admin/sets"
      viewBase="/ultimate/admin/sets"
      variant="ultimate"
    />
  );
}
