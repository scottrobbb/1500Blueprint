import { notFound } from "next/navigation";
import { SetEditor } from "@/components/flashcards/SetEditor";
import { getAdminSession } from "@/lib/auth/requireAdmin";

export default async function UltimateAdminNewSetPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  return (
    <SetEditor
      mode="create"
      allowSharing
      initial={{ title: "", description: "", visibility: "shared", cards: [] }}
      backHref="/ultimate/admin/sets"
      viewBase="/ultimate/admin/sets"
      variant="ultimate"
    />
  );
}
