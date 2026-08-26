"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  claimPasswordAccount,
  loginWithPassword,
  requestPasswordReset,
  signUpWithPassword,
  updatePassword,
  type AuthActionState,
} from "@/app/account/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

type Mode = "login" | "signup" | "forgot" | "reset" | "claim";

type Props = {
  mode: Mode;
  email?: string;
  next?: string;
  initialMessage?: string;
};

const actions: Record<Mode, (state: AuthActionState, formData: FormData) => Promise<AuthActionState>> = {
  login: loginWithPassword,
  signup: signUpWithPassword,
  forgot: requestPasswordReset,
  reset: updatePassword,
  claim: claimPasswordAccount,
};

const INITIAL_AUTH_STATE: AuthActionState = {
  status: "idle",
  message: "",
};

const content: Record<Mode, { eyebrow: string; title: string; description: string; submit: string; pending: string }> = {
  login: {
    eyebrow: "Student account",
    title: "Welcome back",
    description: "Use your email and password to continue studying.",
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    eyebrow: "Create your account",
    title: "Start your blueprint",
    description: "Your progress, scores, and plan will stay with one secure account.",
    submit: "Create account",
    pending: "Creating account…",
  },
  forgot: {
    eyebrow: "Password help",
    title: "Reset your password",
    description: "Enter your account email and we’ll send a secure reset link.",
    submit: "Send reset link",
    pending: "Sending link…",
  },
  reset: {
    eyebrow: "Choose a new password",
    title: "Secure your account",
    description: "Use a password you haven’t used for another account.",
    submit: "Update password",
    pending: "Updating password…",
  },
  claim: {
    eyebrow: "Keep your progress",
    title: "Create your password",
    description: "Add password sign-in to your existing Blueprint account.",
    submit: "Create password login",
    pending: "Creating login…",
  },
};

export function PasswordAuthForm({ mode, email, next = "/drills", initialMessage = "" }: Props) {
  const initialState: AuthActionState = initialMessage
    ? { status: "error", message: initialMessage }
    : INITIAL_AUTH_STATE;
  const [state, formAction, pending] = useActionState(actions[mode], initialState);
  const [showPassword, setShowPassword] = useState(false);
  const copy = content[mode];

  if (state.status === "success") {
    return (
      <div className="text-center" aria-live="polite">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-bg text-success-600">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-[-0.02em] text-navy">
          Check your inbox
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-navy/60">{state.message}</p>
        <Link
          href={`/account/login?next=${encodeURIComponent(next)}`}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/15 px-5 text-sm font-bold text-navy transition-colors hover:border-brand/40 hover:text-brand-600"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  const needsEmail = mode === "login" || mode === "signup" || mode === "forgot";
  const needsPassword = mode === "login" || mode === "signup" || mode === "reset" || mode === "claim";
  const needsConfirmation = mode === "signup" || mode === "reset" || mode === "claim";

  return (
    <form action={formAction} className="w-full">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600">{copy.eyebrow}</p>
      <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-0.035em] text-navy">{copy.title}</h1>
      <p className="mt-2 text-sm leading-6 text-navy/58">{copy.description}</p>

      <input type="hidden" name="next" value={next} />

      <div className="mt-7 space-y-4">
        {mode === "signup" ? (
          <Field label="Student name" error={state.field === "name" ? state.message : undefined}>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              disabled={pending}
              placeholder="Alex Morgan"
              className={inputClass(state.field === "name")}
            />
          </Field>
        ) : null}

        {needsEmail ? (
          <Field label="Email address" error={state.field === "email" ? state.message : undefined}>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              required
              disabled={pending}
              placeholder="student@example.com…"
              className={inputClass(state.field === "email")}
            />
          </Field>
        ) : null}

        {mode === "claim" && email ? (
          <div>
            <span className="block text-sm font-bold text-navy">Account email</span>
            <div className="mt-2 rounded-xl border border-navy/10 bg-haze px-4 py-3 text-sm font-semibold text-navy/65">
              {email}
            </div>
          </div>
        ) : null}

        {needsPassword ? (
          <Field label={mode === "login" ? "Password" : "New password"} error={state.field === "password" ? state.message : undefined}>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? undefined : PASSWORD_MIN_LENGTH}
                disabled={pending}
                placeholder={mode === "login" ? "Your password" : `At least ${PASSWORD_MIN_LENGTH} characters`}
                className={`${inputClass(state.field === "password")} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-1 min-w-12 cursor-pointer rounded-lg px-3 text-xs font-bold text-navy/45 transition-colors hover:text-navy"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {mode !== "login" && state.field !== "password" ? (
              <p className="mt-2 text-xs leading-5 text-navy/42">
                Use {PASSWORD_MIN_LENGTH}+ characters with at least one letter and one number.
              </p>
            ) : null}
          </Field>
        ) : null}

        {needsConfirmation ? (
          <Field label="Confirm password" error={state.field === "confirmPassword" ? state.message : undefined}>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              disabled={pending}
              placeholder="Enter it again"
              className={inputClass(state.field === "confirmPassword")}
            />
          </Field>
        ) : null}
      </div>

      {state.status === "error" && !state.field ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-600">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-brand px-6 text-[15px] font-extrabold text-white shadow-[0_2px_0_#2b8fe0] transition-colors duration-200 hover:bg-[#4db2f8] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {pending ? copy.pending : copy.submit}
      </button>

      <Footer mode={mode} next={next} />
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={fieldId(label)} className="block text-sm font-bold text-navy">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-danger-600">{error}</p> : null}
    </div>
  );
}

function fieldId(label: string): string {
  if (label === "Student name") return "name";
  if (label === "Email address") return "email";
  if (label === "Confirm password") return "confirmPassword";
  return "password";
}

function inputClass(error: boolean): string {
  return `min-h-12 w-full rounded-xl border bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-navy/30 disabled:bg-haze disabled:opacity-70 ${
    error
      ? "border-danger/60 focus:border-danger focus:ring-2 focus:ring-danger/10"
      : "border-navy/15 focus:border-brand focus:ring-2 focus:ring-brand/15"
  }`;
}

function Footer({ mode, next }: { mode: Mode; next: string }) {
  const nextQuery = `?next=${encodeURIComponent(next)}`;
  if (mode === "login") {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/account/forgot-password" className="font-semibold text-brand-600 hover:text-navy">Forgot password?</Link>
        <Link href={`/account/sign-up${nextQuery}`} className="font-semibold text-navy/55 hover:text-navy">Create an account</Link>
      </div>
    );
  }
  if (mode === "signup") {
    return <p className="mt-5 text-center text-sm text-navy/50">Already have an account? <Link href={`/account/login${nextQuery}`} className="font-bold text-brand-600 hover:text-navy">Sign in</Link></p>;
  }
  if (mode === "forgot") {
    return <p className="mt-5 text-center text-sm"><Link href="/account/login" className="font-bold text-brand-600 hover:text-navy">Back to sign in</Link></p>;
  }
  return null;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m5 12 4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
