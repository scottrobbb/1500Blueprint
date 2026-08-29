import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UltimateShell } from "@/components/ultimate/UltimateShell";
import { SuspendedAccount } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getNavStats } from "@/lib/gamification/state";

export const metadata: Metadata = {
  title: {
    default: "Ultimate | 1500 Blueprint",
    template: "%s | 1500 Ultimate",
  },
  description: "The private 1500 Blueprint Ultimate workspace.",
  robots: { index: false, follow: false },
};

export default async function UltimateLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [stats, access] = await Promise.all([getNavStats(session.email), getStudentAccess(session.email)]);
  if (!access.active) return <SuspendedAccount />;
  return <UltimateShell stats={{ ...stats, plan: access.plan }} access={access}>{children}</UltimateShell>;
}
