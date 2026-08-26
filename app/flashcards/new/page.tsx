import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { SetEditor } from "@/components/flashcards/SetEditor";

export const metadata = { title: "New set | 1500 SAT Blueprint" };

export default async function NewSetPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SetEditor mode="create" allowSharing={isAdminEmail(session.email)} backHref="/flashcards" />
  );
}
