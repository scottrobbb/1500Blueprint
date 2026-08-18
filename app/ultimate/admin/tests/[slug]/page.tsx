import Link from "next/link";
import { notFound } from "next/navigation";
import { TestOutline } from "@/components/admin/TestOutline";
import { TestSettingsForm } from "@/components/admin/TestSettingsForm";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getAdminTest } from "@/lib/sat/admin-queries";

export default async function UltimateAdminTestPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { slug } = await params;
  const test = await getAdminTest(slug);
  if (!test) notFound();

  return (
    <UltimateAdminFrame active="tests" email={session.email}>
      <Link href="/ultimate/admin/tests" className="mb-4 inline-flex min-h-10 items-center text-sm font-bold text-navy/50 hover:text-navy">← All practice tests</Link>
      <div className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-navy">{test.title}</h2>
        <TestSettingsForm test={test} />
        <TestOutline test={test} basePath="/ultimate/admin/tests" />
      </div>
    </UltimateAdminFrame>
  );
}
