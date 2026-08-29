import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { SetEditor } from "@/components/flashcards/SetEditor";

export default async function AdminNewSetPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  return (
    <SetEditor
      mode="create"
      allowSharing
      initial={{ title: "", description: "", visibility: "shared", cards: [] }}
      backHref="/admin/sets"
      viewBase="/admin/sets"
    />
  );
}
