"use client";

import { useEffect } from "react";

export default function SettingsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Settings failed to render", error);
  }, [error]);

  return (
    <section className="rounded-2xl border border-danger/15 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-danger-bg text-danger-600">!</span>
      <h1 className="mt-4 font-display text-xl font-extrabold text-navy">Settings could not be loaded</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-navy/52">
        Your account data was not changed. Try loading this page again in a moment.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600"
      >
        Try again
      </button>
    </section>
  );
}
