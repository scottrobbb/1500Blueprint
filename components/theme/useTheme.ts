"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { THEME_ATTRIBUTE, themeCookie, type Theme } from "@/lib/theme/theme";

// `initial` comes from the server, which reads the cookie on the dynamic pages
// that host the control. That keeps React's first render in agreement with the
// HTML rather than correcting it after hydration.
export function useTheme(initial: Theme): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(initial);

  useLayoutEffect(() => {
    // Push the choice out to the one piece of DOM React does not own. This also
    // restores the attribute after Strict Mode's dev remount, which resets the
    // attributes on <html> to the ones React renders from JSX.
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    document.cookie = themeCookie(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
