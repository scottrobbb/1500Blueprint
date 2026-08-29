import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { DEFAULT_AUTH_DESTINATION, isPasswordAuthEnabled } from "@/lib/auth/password";
import { getLegacySession, getPasswordSession } from "@/lib/auth/session";

export const metadata = { title: "Create your password" };

export default async function ClaimAccountPage() {
  if (!isPasswordAuthEnabled()) notFound();
  const next = DEFAULT_AUTH_DESTINATION;
  if (await getPasswordSession()) redirect(next);

  const legacySession = await getLegacySession();
  if (!legacySession) redirect("/login");
  return <PasswordAuthForm mode="claim" email={legacySession.email} next={next} />;
}
