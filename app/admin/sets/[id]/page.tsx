import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getSetForViewer } from "@/lib/flashcards/queries";
import { SetEditor } from "@/components/flashcards/SetEditor";

export default async function AdminEditSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const { id } = await params;
  const set = await getSetForViewer(id, session.email); // admins may view any set
  if (!set) notFound();

  return (
    <SetEditor
      mode="edit"
      setId={set.id}
      initial={{
        title: set.title,
        description: set.description ?? "",
        visibility: set.visibility,
        cards: set.cards.map((c) => ({ term: c.term, definition: c.definition })),
      }}
      allowSharing
      backHref="/admin/sets"
      viewBase="/admin/sets"
    />
  );
}
