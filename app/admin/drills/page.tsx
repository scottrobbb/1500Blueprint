import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills } from "@/lib/drills/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { label } from "@/components/drills/shared/ui";

// Drill settings index: a list of every drill linking to its settings editor.
export default async function DrillSettingsIndexPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const drills = await listDrills();

  return (
    <AdminShell active="settings" email={session.email}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">
            Drill Settings
          </h1>
          <p className="mt-0.5 text-sm text-navy/55">
            Edit each drill&apos;s title, category, accent, and grading config.
          </p>
        </div>

        <ul className="divide-y divide-navy/10 overflow-hidden rounded-card border border-navy/15 bg-white">
          {drills.map((drill) => (
            <li key={drill.slug}>
              <Link
                href={`/admin/drills/${drill.slug}`}
                className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-brand/5"
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-base font-bold text-navy">
                    {drill.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[13px] text-navy/50">
                    <span className="font-mono">{drill.slug}</span>
                    <span aria-hidden="true">·</span>
                    <span>{drill.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className={drill.status === "published" ? "text-success-600" : "text-gold-600"}>{drill.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {drill.usesAi ? (
                    <span className="inline-flex items-center rounded-chip bg-brand/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                      AI
                    </span>
                  ) : null}
                  <span className={`${label} text-navy/35`}>Edit</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}
