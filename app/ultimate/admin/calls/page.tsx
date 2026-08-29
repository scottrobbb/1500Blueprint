import { notFound } from "next/navigation";
import { WeeklyCallsManager } from "@/components/admin/WeeklyCallsManager";
import { CallRecordingsManager } from "@/components/admin/CallRecordingsManager";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAllWeeklyCalls } from "@/lib/calls/queries";
import { isGoogleCalendarConfigured } from "@/lib/calls/google";
import { listRecordingLibraryForAdmin } from "@/lib/calls/recordings";
import { isEmailBroadcastConfigured } from "@/lib/email/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly Calls Admin" };

export default async function UltimateAdminCallsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const [calls, recordingMonths] = await Promise.all([listAllWeeklyCalls(), listRecordingLibraryForAdmin()]);
  return (
    <UltimateAdminFrame active="calls" email={session.email}>
      <WeeklyCallsManager
        initialCalls={calls}
        calendarConfigured={isGoogleCalendarConfigured()}
        emailConfigured={isEmailBroadcastConfigured()}
      />
      <CallRecordingsManager initialMonths={recordingMonths} />
    </UltimateAdminFrame>
  );
}
