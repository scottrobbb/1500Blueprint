import { notFound } from "next/navigation";
import { HistoryView } from "@/components/history/HistoryView";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { loadHistory } from "@/lib/drills/progress";

export const metadata = { title: "History" };

export default async function UltimateHistoryPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const entries = await loadHistory(session.email);
  return <HistoryView entries={entries} variant="ultimate" drillsHref="/ultimate/drills" />;
}
