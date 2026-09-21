"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// PageView for the Meta pixel. The init snippet in the root layout deliberately
// does not track one: an App Router navigation never reloads the document, so
// every PageView -- the first and each route change after it -- is fired from
// here instead. That keeps it at exactly one per page a student sees.
//
// Calls made before fbevents.js finishes loading queue up in the stub, so the
// first PageView survives even though the loader runs after hydration.
export function MetaPixelPageView() {
  const pathname = usePathname();

  useEffect(() => {
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}
