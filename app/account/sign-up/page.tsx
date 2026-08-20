import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordSignupEnabled } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create student account" };

export default async function SignUpPage() {
  if (!isPasswordSignupEnabled()) notFound();
  if (await getSession()) redirect("/drills");
  return <PasswordAuthForm mode="signup" />;
}
