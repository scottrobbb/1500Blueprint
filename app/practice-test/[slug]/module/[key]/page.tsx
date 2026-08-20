import { notFound } from "next/navigation";
import { ModuleRunner } from "@/components/test/ModuleRunner";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleByKey } from "@/lib/sat/modules";
import { getSession } from "@/lib/auth/session";
import { canAccessPracticeTest } from "@/lib/auth/access-control";

export const metadata = {
  title: "Practice module · 1500 SAT Blueprint",
};

// Next 16: route params are async. Site auth is enforced by proxy.ts.
export default async function RunModulePage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const { slug, key } = await params;
  const session = await getSession();
  if (!session || !(await canAccessPracticeTest(session.email, slug))) notFound();
  const test = await loadTest(slug);
  if (!test) notFound();

  const found = getModuleByKey(test, key);
  if (!found) notFound();

  return (
    <ModuleRunner slug={slug} section={found.section} module={found.module} meta={found.meta} />
  );
}
