import { notFound } from "next/navigation";
import { SetLibrary } from "@/components/flashcards/SetLibrary";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listStudentLibrary } from "@/lib/flashcards/queries";

export const metadata = { title: "Flashcards" };

export default async function UltimateFlashcardsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.flashcards) {
    return <AccessGate title="Build your own flashcard decks" description="Custom flashcard sets, sharing, and study tracking are included with Max." currentPlan={access.plan} />;
  }

  const library = await listStudentLibrary(session.email);
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-7">
      <SetLibrary
        owned={library.owned}
        shared={library.shared}
        variant="ultimate"
        hrefBase="/ultimate/flashcards"
        createHref="/ultimate/flashcards/new"
      />
      <p className="mt-5 rounded-xl border border-navy/10 bg-white px-4 py-3 text-xs leading-5 text-navy/50">
        Your existing sets, shared cards, permissions, and study progress are all reused here.
      </p>
    </div>
  );
}
