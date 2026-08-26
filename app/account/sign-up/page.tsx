import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordSignupEnabled, safeNextPath } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create student account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isPasswordSignupEnabled()) notFound();
  const { next: requestedNext } = await searchParams;
  const next = safeNextPath(requestedNext ?? null);
  if (await getSession()) redirect(next);
  return <PasswordAuthForm mode="signup" next={next} />;
}
