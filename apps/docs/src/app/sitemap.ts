import { site } from "@bookmark-scout/config";
import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const { changeFrequency, homePriority, pagePriority } = site.docs.sitemap;
  return source.getPages().map((page) => ({
    url: new URL(page.url, site.docs.origin).toString(),
    lastModified: page.data.lastModified
      ? new Date(page.data.lastModified)
      : undefined,
    changeFrequency:
      changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: page.url === "/" ? homePriority : pagePriority,
  }));
}
