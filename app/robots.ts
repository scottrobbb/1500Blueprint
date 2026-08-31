import type { MetadataRoute } from "next";
import { canonicalAppUrl } from "@/lib/auth/config";

export default function robots(): MetadataRoute.Robots {
  const canonicalUrl = canonicalAppUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing"],
      disallow: [
        "/account",
        "/admin",
        "/api",
        "/community",
        "/drills",
        "/flashcards",
        "/history",
        "/login",
        "/manager",
        "/practice-test",
        "/settings",
        "/ultimate",
      ],
    },
    host: canonicalUrl,
    sitemap: `${canonicalUrl}/sitemap.xml`,
  };
}
