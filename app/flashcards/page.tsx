import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { hasStaffRole } from "@/lib/auth/staff";
import { getHubState } from "@/lib/gamification/state";
import { listStudentLibrary } from "@/lib/flashcards/queries";
import { SetLibrary } from "@/components/flashcards/SetLibrary";

export const metadata = {
  title: "Flashcards | 1500 SAT Blueprint",
  description:
    "Create your own flashcard sets and study the ones your tutor shares. Learn each term and definition your way.",
};

export default async function FlashcardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [hub, library, isExplanationEditor] = await Promise.all([
    getHubState(session.email),
    listStudentLibrary(session.email),
    hasStaffRole(session.email, "explanation_editor"),
  ]);

  const nav = {
    streak: hub.player.streak,
    level: hub.player.level,
    xp: hub.player.xp,
    name: hub.player.name,
    initials: hub.player.initials,
    avatarUrl: hub.player.avatarUrl,
    plan: hub.player.plan,
    isAdmin: isAdminEmail(session.email),
    isExplanationEditor,
  };

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="flashcards" stats={nav} />
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
        <SetLibrary owned={library.owned} shared={library.shared} />
      </main>
    </div>
  );
}
