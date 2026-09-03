"use client";

import { useTheme } from "@/components/theme/useTheme";
import type { Theme } from "@/lib/theme/theme";

export function AppearanceSettings({ initialTheme }: { initialTheme: Theme }) {
  const { theme, setTheme } = useTheme(initialTheme);
  const dark = theme === "dark";

  return (
    <section className="rounded-2xl border-2 border-navy/10 bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <label
            id="dark-mode-label"
            htmlFor="dark-mode"
            className="block cursor-pointer font-display text-base font-extrabold text-navy"
          >
            Dark mode
          </label>
          <p id="dark-mode-note" className="mt-1 text-sm leading-6 text-navy/50">
            Practice tests and score reports stay in Bluebook&apos;s light theme so they match test day.
          </p>
        </div>
        <button
          type="button"
          id="dark-mode"
          role="switch"
          aria-checked={dark}
          aria-labelledby="dark-mode-label"
          aria-describedby="dark-mode-note"
          onClick={() => setTheme(dark ? "light" : "dark")}
          className={`relative inline-flex h-7 w-12 flex-none cursor-pointer items-center rounded-full border-2 transition-colors ${
            dark ? "border-brand bg-brand" : "border-navy/15 bg-navy/[0.07]"
          }`}
        >
          <span
            className={`ml-0.5 h-5 w-5 rounded-full bg-static-white shadow-sm transition-transform ${
              dark ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
