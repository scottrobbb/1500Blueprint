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
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12"
      style={{
        background:
          "linear-gradient(110deg,transparent 36%,rgba(124,203,255,0.22) 44%,transparent 52%)," +
          "linear-gradient(125deg,transparent 56%,rgba(124,203,255,0.16) 63%,transparent 70%)," +
          "linear-gradient(130deg,#07193b 0%,#0b2a5b 42%,#1b46a8 74%,#0b2a5b 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 font-display font-black leading-none tracking-[-0.04em] text-white/[0.04]"
        style={{ fontSize: "260px" }}
      >
        1500
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-7 flex justify-center">
          <Logo className="[&_.text-navy]:text-white" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-[0_20px_60px_rgba(7,25,59,0.35)] sm:p-8">
          <LoginForm initialError={error} />
        </div>

        <p className="mt-5 text-center text-xs text-white/55">
          Access is for active 1500 SAT Blueprint members.
        </p>
      </div>
    </div>
  );
}
