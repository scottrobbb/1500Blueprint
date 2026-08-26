"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [status, setStatus] = useState<Status>(initialError ? "error" : "idle");
  const [message, setMessage] = useState(errorMessage(initialError));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, key: key || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.message ?? "Something went wrong. Try again.");
        return;
      }
      if (data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setStatus("sent");
      setMessage(data?.message ?? "Check your inbox for a login link.");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.01em] text-navy">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-navy/60">{message}</p>
        <button
          onClick={() => {
            setStatus("idle");
            setMessage("");
          }}
          className="mt-6 text-sm font-semibold text-brand-600 transition-colors hover:text-brand"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <h1 className="text-balance font-display text-2xl font-semibold tracking-[-0.01em] text-navy">Email link sign in</h1>
      <p className="mt-2 text-sm leading-6 text-navy/60">
        Enter your account email. We&rsquo;ll send a one-time sign-in link.
      </p>

      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        required
        autoComplete="email"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com…"
        className="mt-6 w-full rounded-lg border border-navy/15 bg-white px-4 py-3 text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15"
      />

      {adminMode && (
        <>
          <label htmlFor="admin-key" className="sr-only">
            Admin access key
          </label>
          <input
            id="admin-key"
            name="key"
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin access key…"
            className="mt-3 w-full rounded-lg border border-navy/15 bg-white px-4 py-3 text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-lg bg-navy px-8 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
      >
        {status === "sending"
          ? adminMode
            ? "Signing in…"
            : "Sending…"
          : adminMode
            ? "Sign in"
            : "Send sign-in link"}
      </button>

      {message ? (
        <p
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 text-sm ${status === "error" ? "text-danger" : "text-navy/60"}`}
        >
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setAdminMode((v) => !v);
          setMessage("");
        }}
        className="mt-5 block w-full text-center text-xs font-medium text-navy/40 transition-colors hover:text-navy/70"
      >
        {adminMode ? "Back to member sign-in" : "Admin sign-in"}
      </button>
    </form>
  );
}

function errorMessage(code?: string): string {
  if (code === "expired") {
    return "That link expired or was already used. Enter your email for a fresh one.";
  }
  if (code === "invalid") return "That link wasn’t valid. Enter your email to try again.";
  return "";
}
