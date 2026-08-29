import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { DEFAULT_AUTH_DESTINATION, isPasswordSignupEnabled } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create student account" };

export default async function SignUpPage() {
  if (!isPasswordSignupEnabled()) notFound();
  const next = DEFAULT_AUTH_DESTINATION;
  if (await getSession()) redirect(next);
  return <PasswordAuthForm mode="signup" next={next} />;
}
