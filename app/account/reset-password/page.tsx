import { notFound, redirect } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { getPasswordSession } from "@/lib/auth/session";

export const metadata = { title: "Choose new password" };

export default async function ResetPasswordPage() {
  if (!isPasswordAuthEnabled()) notFound();
  if (!(await getPasswordSession())) redirect("/account/forgot-password");
  return <PasswordAuthForm mode="reset" />;
}
