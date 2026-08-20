import { notFound } from "next/navigation";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { isPasswordAuthEnabled } from "@/lib/auth/password";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  if (!isPasswordAuthEnabled()) notFound();
  return <PasswordAuthForm mode="forgot" />;
}
