import { notFound } from "next/navigation";
import { SetLibrary } from "@/components/flashcards/SetLibrary";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listStudentLibrary } from "@/lib/flashcards/queries";

export const metadata = { title: "Flashcards" };

export default async function UltimateFlashcardsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

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
