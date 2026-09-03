import { notFound } from "next/navigation";
import { ModuleRunner } from "@/components/test/ModuleRunner";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleByKey } from "@/lib/sat/modules";
import { getSession } from "@/lib/auth/session";
import { canAccessPracticeTest } from "@/lib/auth/access-control";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getNavStats } from "@/lib/gamification/state";
import { isAdminEmail } from "@/lib/auth/admin";
import { BluebookSurface } from "@/components/theme/BluebookSurface";

export const metadata = {
  title: "Practice module · 1500 Blueprint",
};

// Next 16: route params are async. Site auth is enforced by proxy.ts.
export default async function RunModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; key: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug, key } = await params;
  const { workspace } = await searchParams;
  const session = await getSession();
  if (!session || !(await canAccessPracticeTest(session.email, slug))) notFound();
  const test = await loadTest(slug, { includeDraft: isAdminEmail(session.email) });
  if (!test) notFound();

  const found = getModuleByKey(test, key);
  if (!found) notFound();
  const nav = await getNavStats(session.email);
  const returnToUltimate = workspace === "ultimate" && isUltimatePreviewEmail(session.email);

  return (
    <BluebookSurface>
      <ModuleRunner
        slug={slug}
        section={found.section}
        module={found.module}
        meta={found.meta}
        studentName={nav.name}
        returnToUltimate={returnToUltimate}
      />
    </BluebookSurface>
  );
}
