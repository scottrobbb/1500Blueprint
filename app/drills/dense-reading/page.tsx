import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSessionForDenseReading } from "@/lib/dense-reading/access";
import { listReadingHistory } from "@/lib/dense-reading/server";
import { DenseReadingLibrary } from "@/components/drills/dense-reading/DenseReadingLibrary";
import { reportServerError } from "@/lib/observability/server";

export const metadata = { title: "Dense Reading | 1500 Blueprint" };
export default async function DenseReadingPage() {
  if (!(await getSession()))
    redirect("/account/login?next=%2Fdrills%2Fdense-reading");
  const session = await getSessionForDenseReading();
  if (!session) redirect("/ultimate/drills");
  let history;
  try {
    history = await listReadingHistory(session.email);
  } catch (error) {
    reportServerError("dense_reading.library.failed", error, {
      provider: "supabase",
    });
  }
  return <DenseReadingLibrary history={history ?? []} unavailable={!history} />;
}
