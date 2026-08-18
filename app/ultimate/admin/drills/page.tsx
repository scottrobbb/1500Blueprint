import Link from "next/link";
import { notFound } from "next/navigation";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills } from "@/lib/drills/admin-queries";

export default async function UltimateAdminDrillsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const drills = await listDrills();

  return (
    <UltimateAdminFrame active="drills" email={session.email}>
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-navy">Drill settings</h2>
      <p className="mt-1 text-sm text-navy/50">Control titles, categories, accents, grading, and availability.</p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {drills.map((drill) => (
          <li key={drill.slug}>
            <Link href={`/ultimate/admin/drills/${drill.slug}`} className="flex min-h-20 items-center gap-4 rounded-2xl border border-navy/10 bg-haze/30 p-4 transition-colors hover:border-brand/35 hover:bg-ice/30">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-sm font-extrabold uppercase text-sky">{drill.title.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate font-display text-base text-navy">{drill.title}</strong>
                <span className="mt-0.5 block text-xs text-navy/45">{drill.category}{drill.usesAi ? " · AI graded" : ""}</span>
              </span>
              <span className="text-xs font-bold text-brand-600">Edit →</span>
            </Link>
          </li>
        ))}
      </ul>
    </UltimateAdminFrame>
  );
}
