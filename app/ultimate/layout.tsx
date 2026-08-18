import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UltimateShell } from "@/components/ultimate/UltimateShell";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getNavStats } from "@/lib/gamification/state";

export const metadata: Metadata = {
  title: {
    default: "Ultimate — 1500 SAT Blueprint",
    template: "%s — 1500 Ultimate",
  },
  description: "The private 1500 SAT Blueprint Ultimate workspace.",
  robots: { index: false, follow: false },
};

export default async function UltimateLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const stats = await getNavStats(session.email);
  return <UltimateShell stats={stats}>{children}</UltimateShell>;
}
