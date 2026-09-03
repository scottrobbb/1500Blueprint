import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/theme";

// Rendered inside <head> so it executes during HTML parsing, ahead of the first
// paint. See app/layout.tsx for why <html> carries suppressHydrationWarning.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />;
}
