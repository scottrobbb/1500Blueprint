import { notFound } from "next/navigation";
import { SetEditor } from "@/components/flashcards/SetEditor";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";

export default async function UltimateNewSetPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
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
