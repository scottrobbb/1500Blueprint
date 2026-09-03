import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(canonicalAppUrl()),
  title: "1500 Blueprint | Practice",
  description:
    "Full-length, Bluebook-style digital SAT practice tests from the 1500 Blueprint.",
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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
