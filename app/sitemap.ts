import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/store/origin";

export const dynamic = "force-dynamic";

// Only publicly reachable, indexable pages. Product and seller pages are
// omitted deliberately: they come and go with moderation decisions, and a
// sitemap that advertises listings which have since been unpublished is worse
// than no entry at all.
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  if (!origin) return [];
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/store`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/store/search`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
  ];
}
