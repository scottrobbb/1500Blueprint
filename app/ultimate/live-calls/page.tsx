import { PageHeader } from "@/components/ultimate/PageHeader";
import { notFound } from "next/navigation";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";

export const metadata = { title: "Live Calls" };

export default async function UltimateLiveCallsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.liveGroupClasses) {
    return <AccessGate title="Join Scott's weekly live calls" description="Weekly group classes and their recordings are included with Max." currentPlan={access.plan} />;
  }
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
      <PageHeader
        eyebrow="Connect"
        title="Live Calls"
        description="Scott's live-call schedule and recordings will live here."
      />
      <section className="mt-7 min-h-64 rounded-[18px] border border-dashed border-navy/15 bg-white" />
    </div>
  );
}
