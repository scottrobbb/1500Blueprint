import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { getLegacySession, getPasswordSession } from "@/lib/auth/session";

export const metadata = { title: "Create your password" };

export default async function ClaimAccountPage() {
  if (!isPasswordAuthEnabled()) notFound();
  if (await getPasswordSession()) redirect("/drills");

  const legacySession = await getLegacySession();
  if (!legacySession) redirect("/login");
  return <PasswordAuthForm mode="claim" email={legacySession.email} />;
}
