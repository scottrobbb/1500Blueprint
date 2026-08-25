import { notFound } from "next/navigation";
import { WeeklyCallsManager } from "@/components/admin/WeeklyCallsManager";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAllWeeklyCalls } from "@/lib/calls/queries";
import { isGoogleCalendarConfigured } from "@/lib/calls/google";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly Calls Admin" };

export default async function UltimateAdminCallsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  return (
    <UltimateAdminFrame active="calls" email={session.email}>
      <WeeklyCallsManager initialCalls={await listAllWeeklyCalls()} calendarConfigured={isGoogleCalendarConfigured()} />
    </UltimateAdminFrame>
  );
}
