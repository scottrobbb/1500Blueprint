import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordAuthEnabled, safeNextPath } from "@/lib/auth/password";
import { getLegacySession, getPasswordSession } from "@/lib/auth/session";

export const metadata = { title: "Create your password" };

export default async function ClaimAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isPasswordAuthEnabled()) notFound();
  const { next: requestedNext } = await searchParams;
  const next = safeNextPath(requestedNext ?? null);
  if (await getPasswordSession()) redirect(next);

  const legacySession = await getLegacySession();
  if (!legacySession) redirect("/login");
  return <PasswordAuthForm mode="claim" email={legacySession.email} next={next} />;
}
