import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordAuthEnabled, safeNextPath } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Student sign in" };

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isPasswordAuthEnabled()) notFound();
  if (await getSession()) redirect("/drills");

  const params = await searchParams;
  const message = params.error === "confirmation"
    ? "That confirmation link is invalid or expired."
    : params.error === "account"
      ? "Your email was verified, but the student account could not be linked."
      : "";

  return <PasswordAuthForm mode="login" next={safeNextPath(params.next ?? null)} initialMessage={message} />;
}
