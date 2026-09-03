import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplanationManager } from "@/components/manager/ExplanationManager";
import { Logo } from "@/components/Logo";
import { isAdminEmail } from "@/lib/auth/admin";
import { getExplanationEditorSession } from "@/lib/auth/staff";
import { countExplanationQueueRemaining, listExplanationEditorStats, listExplanationQueue } from "@/lib/explanations/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explanation Manager · 1500 Blueprint" };

export default async function ManagerPage() {
  const session = await getExplanationEditorSession();
  if (!session) notFound();
  const [queue, stats, remainingTotal] = await Promise.all([
    listExplanationQueue(),
    listExplanationEditorStats(),
    countExplanationQueueRemaining(),
  ]);
  const editorStats = stats.find((item) => item.email === session.email);

  return (
    // The explanation queue previews Bluebook-styled question content, so this
    // staff tool stays on the light palette alongside the exam replica.
    <main data-theme="light" className="min-h-dvh bg-[#f3f6fa] text-ink">
      <header className="border-b border-white/10 bg-[#0c2348] px-4 py-4 text-white sm:px-7">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4">
          <Logo className="[&>img]:h-8 [&>img]:w-8 [&_span]:text-white" />
          <div className="h-8 w-px bg-white/15" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-sky">Content operations</p>
            <h1 className="font-display text-lg font-extrabold">Explanation Manager</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-[240px] truncate text-xs text-white/55 sm:block">{session.email}</span>
            {isAdminEmail(session.email) ? <Link href="/ultimate/admin/staff" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-bold text-white hover:bg-white/10">Manage team</Link> : null}
          </div>
        </div>
      </header>
      <ExplanationManager
        initialItems={queue}
        initialCompletedTotal={editorStats?.completedTotal ?? 0}
        initialRemainingTotal={remainingTotal}
      />
    </main>
  );
}
