// Theme preference plumbing.
//
// The choice lives in a cookie rather than localStorage so the inline bootstrap
// script can read it synchronously while the browser is still parsing <head>,
// which is what keeps a dark-mode student from seeing a white flash on every
// hard navigation. Reading it with `cookies()` in the root layout would work
// too, but that would opt the whole app — including the static marketing
// pages — out of prerendering, so the script reads `document.cookie` instead.

export const THEME_COOKIE = "bp-theme";
export const THEME_ATTRIBUTE = "data-theme";
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "light";

// One year: long enough that a returning student keeps their choice, short
// enough that an abandoned browser eventually falls back to the default.
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function readThemeCookie(cookieString: string): Theme {
  const match = new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`).exec(cookieString);
  return normalizeTheme(match?.[1]);
}

// Runs before first paint, so it stays small and never throws: a browser with
// cookies disabled simply keeps the server-rendered default.
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.setAttribute("${THEME_ATTRIBUTE}",m[1])}catch(e){}})()`;
