import type { MetadataRoute } from "next";
import { canonicalAppUrl } from "@/lib/auth/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${canonicalAppUrl()}/pricing`, changeFrequency: "weekly", priority: 1 }];
}
