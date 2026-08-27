import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSetForViewer } from "@/lib/flashcards/queries";
import { StudyDeck } from "@/components/flashcards/StudyDeck";
import { ActivityBeacon } from "@/components/home/ActivityBeacon";

export default async function StudySetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const set = await getSetForViewer(id, session.email);
  if (!set) notFound();

  return (
    <>
      <ActivityBeacon kind="flashcard_set" resourceId={id} />
      <StudyDeck title={set.title} cards={set.cards} backHref={`/flashcards/${id}`} />
    </>
  );
}
