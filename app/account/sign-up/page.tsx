import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordSignupEnabled, safeNextPath } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create student account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (!isPasswordSignupEnabled()) notFound();
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getSession()) redirect(next);
  return <PasswordAuthForm mode="signup" next={next} />;
}
