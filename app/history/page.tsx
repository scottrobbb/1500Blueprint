import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { HistoryView } from "@/components/history/HistoryView";
import { getSession } from "@/lib/auth/session";
import { getNavStats } from "@/lib/gamification/state";
import { loadHistory } from "@/lib/drills/progress";

export const metadata = {
  title: "History | 1500 Blueprint",
  description: "Browse every drill question you've worked on and review how you did.",
};

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [nav, entries] = await Promise.all([
    getNavStats(session.email),
    loadHistory(session.email),
  ]);

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="history" stats={nav} />
      <HistoryView entries={entries} />
      <footer className="mx-auto w-full max-w-[1120px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </div>
  );
}
