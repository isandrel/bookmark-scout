import { DOCS_URL } from "@bookmark-scout/config";
import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: new URL(page.url, DOCS_URL).toString(),
    lastModified: page.data.lastModified
      ? new Date(page.data.lastModified)
      : undefined,
    changeFrequency: "weekly",
    priority: page.url === "/" ? 1.0 : 0.8,
  }));
}
