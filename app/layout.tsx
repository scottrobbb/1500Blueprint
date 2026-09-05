import type { Metadata } from "next";
import Script from "next/script";
import { Gabarito, DM_Sans, Noto_Serif } from "next/font/google";
import { canonicalAppUrl } from "@/lib/auth/config";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { DEFAULT_THEME } from "@/lib/theme/theme";
import "./globals.css";
import "katex/dist/katex.min.css";

const gabarito = Gabarito({
  subsets: ["latin"],
  variable: "--font-gabarito",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Exam content font — a faithful serif for the Bluebook-style question screens.
const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

// Rewardful's site key. Public by design -- it ships in the page so their
// script can identify the account.
const REWARDFUL_API_KEY = "baf21b";

const SHARE_DESCRIPTION =
  "Full-length adaptive digital SAT practice tests, a 1250+ question bank with Desmos explanations, targeted drills, and courses.";

export const metadata: Metadata = {
  metadataBase: new URL(canonicalAppUrl()),
  title: "1500 Blueprint | Practice",
  description:
    "Full-length, Bluebook-style digital SAT practice tests from the 1500 Blueprint.",
  // What Messages, Slack, and X read when the link is shared -- they use these,
  // never <title>. Set once here and inherited by every route, so the bare
  // domain (which redirects to /pricing) is shared under the brand rather than
  // under a page name. A page that overrides `openGraph` replaces this whole
  // block, so add to it rather than redeclaring it downstream.
  openGraph: {
    type: "website",
    siteName: "1500 Blueprint",
    title: "1500 Blueprint",
    description: SHARE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "1500 Blueprint",
    description: SHARE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      // The bootstrap script rewrites data-theme before React hydrates; without
      // this React would treat the corrected attribute as a mismatch.
      suppressHydrationWarning
      className={`${gabarito.variable} ${dmSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        {children}
        {/* Affiliate tracking. The queue has to exist before rw.js runs, which
            beforeInteractive guarantees regardless of the order here: it is
            injected into the initial HTML, while rw.js loads afterInteractive.
            Attribution is finished server-side in /api/billing/checkout. */}
        <Script id="rewardful-queue" strategy="beforeInteractive">
          {`(function(w,r){w._rwq=r;w[r]=w[r]||function(){(w[r].q=w[r].q||[]).push(arguments)}})(window,'rewardful');`}
        </Script>
        <Script src="https://r.wdfl.co/rw.js" data-rewardful={REWARDFUL_API_KEY} />
      </body>
    </html>
  );
}
