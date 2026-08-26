import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in | 1500 SAT Blueprint",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, { error }] = await Promise.all([getSession(), searchParams]);
  if (session) redirect("/drills");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f4f5f6] px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-xl border border-navy/12 bg-white p-7 shadow-[0_1px_2px_rgba(19,35,59,0.05)] sm:p-8">
          <LoginForm initialError={error} />
        </div>

        <p className="mt-5 text-center text-xs text-navy/45">
          Use the email connected to your Blueprint account.
        </p>
      </div>
    </div>
  );
}
